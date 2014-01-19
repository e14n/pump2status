// statusnetuser.js
//
// data object representing an statusnetuser
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

module.exports = function(config, StatusNet) {

    var StatusNetUser = DatabankObject.subClass("statusnetuser");

    StatusNetUser.schema = {
        "statusnetuser": {
            pkey: "id",
            fields: ["name",
                     "hostname",
                     "avatar",
                     "token",
                     "secret",
                     "friends",
                     "autopost",
                     "created",
                     "updated"]
        }
    };

    StatusNetUser.hostname = function(person) {
        var parts;
        if (!_.isString(person.statusnet_profile_url)) {
            return null;
        }
        parts = urlparse(person.statusnet_profile_url);
        if (parts && parts.hostname) {
            return parts.hostname;
        } else {
            return null;
        }
    };

    StatusNetUser.id = function(person) {
        var hostname = StatusNetUser.hostname(person);

        if (hostname && person.screen_name && person.screen_name.length > 0) {
            return person.screen_name + "@" + hostname;
        } else {
            return null;
        }
    };

    StatusNetUser.fromUser = function(person, token, secret, callback) {

        var snu = new StatusNetUser();

        snu.hostname  = StatusNetUser.hostname(person);

        if (!snu.hostname) {
            callback(new Error("No hostname"), null);
            return;
        }

        snu.id = StatusNetUser.id(person);

        if (!snu.id) {
            callback(new Error("No id"), null);
            return;
        }

        snu.name   = person.name;
        snu.avatar = person.profile_image_url;

        snu.token  = token;
        snu.secret = secret;

        // XXX: SSL?
        // XXX: index.php/ prefix?

        snu.following = 'http://'+snu.hostname+'/api/statuses/friends/'+person.screen_name+'.json';

        snu.save(callback);
    };

    StatusNetUser.getHostname = function(id) {
        var parts = id.split("@"),
            hostname = parts[1].toLowerCase();

        return hostname;
    };

    StatusNetUser.prototype.getHost = function(callback) {
        var snu = this;
        StatusNet.get(snu.hostname, callback);
    };

    StatusNetUser.prototype.getUser = function(callback) {
        var snu = this;

        async.waterfall([
            function(callback) {
                Shadow.get(snu.id, callback);
            },
            function(shadow, callback) {
                User.get(shadow.pumpio, callback);
            }
        ], callback);
    };

    StatusNetUser.prototype.beFound = function(callback) {

        var snu = this,
            user;

        async.waterfall([
            function(callback) {
                snu.getUser(callback);
            },
            function(results, callback) {
                user = results;
                Edge.search({to: snu.id}, callback);
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

    StatusNetUser.prototype.updateFollowing = function(site, callback) {

        var snu = this,
            sn,
            oa,
            addEdge = function(id, callback) {
                var edge = new Edge({from: snu.id, to: id});
                edge.save(callback);
            },
            q = async.queue(addEdge, 25);

        async.waterfall([
            function(callback) {
                snu.getHost(callback);
            },
            function(results, callback) {

                var getPage = function(i, callback) {

                    async.waterfall([
                        function(callback) {
                            oa.get(snu.following + "?page=" + i, snu.token, snu.secret, callback);
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

                            ids = _.compact(_.map(following, function(person) { return StatusNetUser.id(person); }));

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

    StatusNetUser.prototype.findFriends = function(callback) {

        var snu = this,
            user;

        async.waterfall([
            // Get the user
            function(callback) {
                snu.getUser(callback);
            },
            // Find outgoing edges from this user
            function(results, callback) {
                user = results;
                Edge.search({from: snu.id}, callback);
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

    StatusNetUser.prototype.associate = function(user, callback) {

        var snu = this;
        
        Shadow.create({statusnet: snu.id, pumpio: user.id}, callback);

    };

    StatusNetUser.prototype.getNickname = function(callback) {
        var snuser = this,
            parts;

        if (!_.isString(snuser.id)) {
            return null;
        } else {
            parts = snuser.id.split('@');
            return parts[0];
        }
    };

    StatusNetUser.prototype.forwardActivity = function(activity, site, callback) {
        var snuser = this,
            isPublicPostNoteActivity = function(act) {
            var recip = [];
            _.each(["to", "cc", "bto", "bcc"], function(prop) {
                if (_.isArray(act[prop])) {
                    recip = recip.concat(act[prop]);
                }
            }); 
            return act.verb == "post" &&
                act.object.objectType == "note" &&
                _.some(recip, function(rec) { 
                    return rec.objectType == "collection" && 
                        rec.id == "http://activityschema.org/collection/public";
                });
        };

        if (isPublicPostNoteActivity(activity)) {
            snuser.postActivity(activity, site, callback);
        } else {
            callback(null);
        }
    };

    StatusNetUser.prototype.postActivity = function(activity, site, callback) {

        var snu = this;

        async.waterfall([
            function(callback) {
                snu.getHost(callback);
            },
            function(sn, callback) {
                var oa = sn.getOAuth(site),
                    nickname = snu.getNickname(),
                    entry = new AtomActivity(activity),
                    url = 'http://'+snu.hostname+'/api/statuses/user_timeline/'+nickname+'.atom';

                oa.post(url, snu.token, snu.secret, entry.toString(), "application/atom+xml", callback);
            }
        ], function(err, body, response) {
            callback(err);
        });
    };

    StatusNetUser.prototype.visibleId = function() {
        return this.id;
    };

    return StatusNetUser;
};
