// twitteruser.js
//
// data object representing a Twitter user
//
// Copyright 2013, E14N (https://e14n.com/)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

require("set-immediate");

var _ = require("underscore"),
    async = require("async"),
    urlparse = require("url").parse,
    DatabankObject = require("databank").DatabankObject,
    Shadow = require("./shadow"),
    Edge = require("./edge"),
    AtomActivity = require("../lib/atomactivity"),
    PumpIOClientApp = require("pump.io-client-app"),
    Twitter = require("./twitter"),
    User = PumpIOClientApp.User,
    validator = require("validator"),
    sanitize = validator.sanitize;

module.exports = function(config, Twitter) {

    var TwitterUser = DatabankObject.subClass("twitteruser"),
        hostname = "twitter.com";

    TwitterUser.schema = {
        "twitteruser": {
            pkey: "id",
            fields: ["screen_name",
                     "id_str",
                     "name",
                     "avatar",
                     "token",
                     "secret",
                     "autopost",
                     "created",
                     "updated"]
        }
    };

    TwitterUser.id = function(person) {
        if (person.id_str && person.id_str.length > 0) {
            return person.id_str + "@" + hostname;
        } else {
            return null;
        }
    };

    TwitterUser.fromUser = function(person, token, secret, callback) {

        var tu = new TwitterUser();

        tu.id = TwitterUser.id(person);

        if (!tu.id) {
            callback(new Error("No id"), null);
            return;
        }

        tu.screen_name = person.screen_name;
        tu.id_str      = person.id_str;
        tu.name        = person.name;
        tu.avatar      = person.profile_image_url;

        tu.token  = token;
        tu.secret = secret;

        tu.autopost = false;

        tu.save(callback);
    };

    TwitterUser.getHostname = function(id) {
        return hostname;
    };

    TwitterUser.prototype.getHost = function(callback) {
        return Twitter;
    };

    TwitterUser.prototype.getUser = function(callback) {
        var tu = this;

        async.waterfall([
            function(callback) {
                Shadow.get(tu.id, callback);
            },
            function(shadow, callback) {
                User.get(shadow.pumpio, callback);
            }
        ], callback);
    };

    TwitterUser.prototype.beFound = function(callback) {

        var tu = this,
            user;

        async.waterfall([
            function(callback) {
                tu.getUser(callback);
            },
            function(results, callback) {
                user = results;
                Edge.search({to: tu.id}, callback);
            },
            // Find pump.io IDs of originators of these edges waiting for this user to join
            function(edges, callback) {
                var waiters = _.pluck(edges, "from");
                Shadow.readArray(waiters, callback);
            },
            function(shadows, callback) {
                var ids = _.pluck(shadows, "pumpio");
                if (!ids || ids.length === 0) {
                    callback(null);
                } else {
                    // For each shadow, have it follow the pump.io account
                    async.forEachLimit(ids,
                                       25,
                                       function(id, callback) {
                                           async.waterfall([
                                               function(callback) {
                                                   User.get(id, callback);
                                               },
                                               function(waiter, callback) {
                                                   waiter.postActivity({verb: "follow", object: {objectType: "person", id: user.id}}, callback);
                                               }
                                           ], callback);
                                       },
                                       callback);
                }
            }
        ], callback);
    };

    TwitterUser.prototype.updateFollowing = function(site, callback) {

        var tu = this,
            addEdge = function(id, callback) {
                Edge.create({from: tu.id, to: id}, callback);
            },
            deleteEdge = function(id, callback) {
                var bank = Edge.bank();
                bank.del(Edge.type, Edge.key(tu.id, id), callback);
            };

        async.waterfall([
            function(callback) {
                async.parallel([
                    function(callback) {
                        var following = "https://api.twitter.com/1.1/friends/ids.json?cursor=-1&user_id="+tu.id_str,
                            oa = Twitter.getOAuth(site);
                    
                        // Get the current following list (up to 5000!) from Twitter
                        // XXX: Handle users following more than 5000 others

                        oa.get(following, tu.token, tu.secret, function(err, doc, resp) {
                            var results;
                            if (err) {
                                callback(err, null);
                            } else {
                                try {
                                    results = JSON.parse(doc);
                                } catch (e) {
                                    callback(e, null);
                                    return;
                                }
                            }
                            callback(null, results.ids);
                        });
                    },
                    function(callback) {
                        // Get the edges we know about from the database
                        Edge.search({from: tu.id}, callback);
                    }
                ], callback);
            },
            function(results, callback) {
                var ids = results[0],
                    edges = results[1],
                    known = _.pluck(edges, "to"),
                    current = _.map(ids, function(id) { return id + "@twitter.com"; }),
                    toAdd = _.difference(current, known),
                    toDel = _.difference(known, current);

                // XXX: autofollow

                async.parallel([
                    function(callback) {
                        // Add new ones we haven't seen before
                        async.eachLimit(toAdd, 16, addEdge, callback);
                    },
                    function(callback) {
                        // Remove old ones that are no longer current
                        async.eachLimit(toDel, 16, deleteEdge, callback);
                    }
                ], callback);
            }
        ], function(err) {
            callback(err);
        });
    };

    // XXX: get already-following info

    TwitterUser.prototype.findFriends = function(callback) {

        var tu = this,
            user;

        async.waterfall([
            // Get the user
            function(callback) {
                tu.getUser(callback);
            },
            // Find outgoing edges from this user
            function(results, callback) {
                user = results;
                Edge.search({from: tu.id}, callback);
            },
            // Find pump.io IDs of originators of these edges waiting for this user to join
            function(edges, callback) {
                var snFriends = _.pluck(edges, "to");
                Shadow.readArray(snFriends, callback);
            },
            function(shadows, callback) {
                var ids = _.filter(_.uniq(_.pluck(_.compact(shadows), "pumpio")),
                                   function(id) { return id != user.id; });
                // For each shadow, get its User
                User.readArray(ids, callback);
            }
        ], callback);
    };

    TwitterUser.prototype.associate = function(user, callback) {
        var tu = this;
        Shadow.create({twitter: tu.id, pumpio: user.id}, callback);
    };

    TwitterUser.prototype.getNickname = function(callback) {
        var tuser = this,
            parts;

        setImmediate(function() {
            callback(null, tuser.screen_name);
        });
    };

    // XXX: forward non-public stuff to followers iff user has a private account
    // XXX: forward public images

    TwitterUser.prototype.postActivity = function(activity, site, callback) {

        var tu = this,
            oa = Twitter.getOAuth(site),
            url = 'https://api.twitter.com/1.1/statuses/update.json',
            stripTags = function(str) {
                return str.replace(/<(?:.|\n)*?>/gm, '');
            },
            toStatus = function(activity) {
                var content = activity.object.content,
                    link = activity.object.url,
                    base = stripTags(sanitize(content).entityDecode());

                if (base.length <= 140) {
                    return base;
                } else {
                    return base.substr(0, 125) + "… " + link;
                }
            },
            params = {status: toStatus(activity)};

        oa.post(url, tu.token, tu.secret, params, function(err, doc, resp) {
            // XXX: stop trying to post if OAuth error
            // XXX: retry on transient failures
            callback(err);
        });
    };

    return TwitterUser;
};
