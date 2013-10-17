// forwarder.js
//
// Forwards the state of the world
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
    User = require("../models/user"),
    Host = require("../models/host"),
    Shadow = require("../models/shadow"),
    Pump2Status = require("../models/pump2status"),
    StatusNetUser = require("../models/statusnetuser");

var ignore = function(err) {};

var S = 1000;
var M = 60 * S;
var H = 60 * M;

var Forwarder = function(options) {
    var log = options.log.child({component: "forwarder"}),
        site = options.site,
        forwardAll = function() {
            log.info("Start queueing users");
            User.scan(
                function(user) {
                    q.push(user, function(err) {
                        if (err) {
                            log.error(err);
                        } else {
                            log.info({user: user.id}, "Done forwarding");
                        }
                    });
                },
                function(err) {
                    if (err) {
                        log.error(err);
                    } else {
                        log.info("Done queueing users");
                    }
                }
            );
        },
        forwardActivities = function(user, callback) {
            var a = 0,
                getAutos = function(callback) {
                    async.waterfall([
                        function(callback) {
                            Shadow.search({pumpio: user.id}, callback);
                        },
                        function(shadows, callback) {
                            var ids = _.pluck(shadows, "statusnet");
                            StatusNetUser.readArray(ids, callback);
                        },
                        function(snus, callback) {
                            var autos = _.filter(snus, function(snu) { return snu.autopost; });
                            callback(null, autos);
                        }
                    ], callback);
                },
                getNewPublicPostNotes = function(callback) {
                    async.waterfall([
                        function(callback) {
                            user.getHost(callback);
                        },
                        function(host, callback) {
                            var oa = host.getOAuth(),
                                url;
                            // XXX: just use client auth?
                            if (user.lastseen) {
                                url = user.outbox + "?since=" + user.lastseen;
                            } else {
                                url = user.outbox;
                            }
                            oa.get(url, user.token, user.secret, callback);
                        },
                        function(data, response, callback) {
                            var feed;
                            if (response.statusCode >= 400 && response.statusCode < 600) {
                                callback(new Error("Error " + response.StatusCode + ": " + data));
                            } else if (!response.headers || 
                                       !response.headers["content-type"] || 
                                       response.headers["content-type"].substr(0, "application/json".length) != "application/json") {
                                callback(new Error("Not application/json"));
                            } else {
                                try {
                                    feed = JSON.parse(data);
                                    callback(null, feed);
                                } catch (e) {
                                    callback(e, null);
                                }
                            }
                        },
                        function(feed, callback) {
                            if (feed.items && feed.items.length) {
                                async.parellel([
                                    function(callback) {
                                        user.lastseen = feed.items[0].id;
                                        user.save(callback);
                                    },
                                    function(callback) {
                                        var ppna = _.filter(feed.items, isPublicPostNoteActivity);
                                        callback(null, ppna);
                                    }
                                ], callback);
                            } else {
                                callback(null, [null, []]);
                            }
                        },
                        function(results, callback) {
                            callback(null, results[1]);
                        }
                    ], callback);
                },
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
                },
                autos,
                ppnas;

            async.waterfall([
                function(callback) {
                    getAutos(callback);
                },
                function(results, callback) {
                    autos = results;
                    if (_.isArray(autos) && autos.length > 0) {
                        getNewPublicPostNotes(callback);
                    } else {
                        // We can skip costly requests if we're not forwarding the activities
                        callback(null, []);
                    }
                },
                function(results, callback) {
                    var ppnas = results;

                    async.each(ppnas, function(ppna, callback) {
                        async.each(autos, function(auto, callback) {
                            auto.postActivity(ppna, site, function(err) {
                                if (err) {
                                    log.error({user: user.id, snuser: auto.id, activity: ppna.id, err: err});
                                } else {
                                    log.info({user: user.id, snuser: auto.id, activity: ppna.id}, "Forwarded");
                                }
                                // Ignore errors
                                callback(null);
                            });
                        });
                    }, callback);
                }
            ], callback);
        },
        q = async.queue(forwardActivities, 25);

    this.start = function() {
        // Do this every 15 minutes
        setInterval(forwardAll, 15 * M);
        // Do one at the beginning
        forwardAll();
        return;
    };
};

module.exports = Forwarder;
