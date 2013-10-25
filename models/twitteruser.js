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

var _ = require("underscore"),
    async = require("async"),
    urlparse = require("url").parse,
    DatabankObject = require("databank").DatabankObject,
    Shadow = require("./shadow"),
    Edge = require("./edge"),
    AtomActivity = require("../lib/atomactivity"),
    PumpIOClientApp = require("pump.io-client-app"),
    User = PumpIOClientApp.User;

module.exports = function(config, Twitter) {

    var TwitterUser = DatabankObject.subClass("twitteruser");

    TwitterUser.schema = {
        "twitteruser": {
            pkey: "id",
            fields: ["name",
                     "avatar",
                     "token",
                     "secret",
                     "friends",
                     "autopost",
                     "created",
                     "updated"]
        }
    };

    TwitterUser.id = function(person) {
        var hostname = TwitterUser.hostname(person);

        if (hostname && person.screen_name && person.screen_name.length > 0) {
            return person.screen_name + "@" + hostname;
        } else {
            return null;
        }
    };

    TwitterUser.fromUser = function(person, token, secret, callback) {

        var tu = new TwitterUser();

        tu.hostname  = TwitterUser.hostname(person);

        if (!tu.hostname) {
            callback(new Error("No hostname"), null);
            return;
        }

        tu.id = TwitterUser.id(person);

        if (!tu.id) {
            callback(new Error("No id"), null);
            return;
        }

        tu.name   = person.name;
        tu.avatar = person.profile_image_url;

        tu.token  = token;
        tu.secret = secret;

        tu.save(callback);
    };

    TwitterUser.getHostname = function(id) {
        var parts = id.split("@"),
            hostname = parts[1].toLowerCase();

        return hostname;
    };

    TwitterUser.prototype.getHost = function(callback) {
        var tu = this;
        Twitter.get(tu.hostname, callback);
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
            sn,
            oa,
            addEdge = function(id, callback) {
                var edge = new Edge({from: tu.id, to: id});
                edge.save(callback);
            },
            q = async.queue(addEdge, 25);

        async.waterfall([
            function(callback) {
                tu.getHost(callback);
            },
            function(results, callback) {

                var getPage = function(i, callback) {

                    async.waterfall([
                        function(callback) {
                            oa.get(tu.following + "?page=" + i, tu.token, tu.secret, callback);
                        },
                        function(doc, resp, callback) {
                            var following, ids;

                            try {
                                following = JSON.parse(doc);
                            } catch (e) {
                                callback(e);
                                return;
                            }

                            // Get valid-looking IDs

                            ids = _.compact(_.map(following, function(person) { return TwitterUser.id(person); }));

                            q.push(ids);
                            callback(null, following.length);
                        }
                    ], function(err, len) {
                        if (err) {
                            callback(err);
                        } else if (len < 100) {
                            callback(null);
                        } else {
                            getPage(i+1, callback);
                        }
                    });
                };

                sn = results;
                oa = sn.getOAuth(site);

                getPage(1, callback);
            }
        ], callback);
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

        if (!_.isString(tuser.id)) {
            return null;
        } else {
            parts = tuser.id.split('@');
            return parts[0];
        }
    };

    TwitterUser.prototype.postActivity = function(activity, site, callback) {

        var tu = this;

        async.waterfall([
            function(callback) {
                tu.getHost(callback);
            },
            function(sn, callback) {
                var oa = sn.getOAuth(site),
                    nickname = tu.getNickname(),
                    entry = new AtomActivity(activity),
                    url = 'http://'+tu.hostname+'/api/statuses/user_timeline/'+nickname+'.atom';

                oa.post(url, tu.token, tu.secret, entry.toString(), "application/atom+xml", callback);
            }
        ], function(err, body, response) {
            callback(err);
        });
    };

    return TwitterUser;
};
