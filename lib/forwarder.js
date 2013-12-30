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
    PumpIOClientApp = require("pump.io-client-app"),
    User = PumpIOClientApp.User,
    Host = PumpIOClientApp.Host,
    Shadow = require("../models/shadow");

var Forwarder = function(options) {
    var log = options.log.child({component: "forwarder"}),
        site = options.site,
        ForeignUser = options.ForeignUser,
        ForeignHost = options.ForeignHost,
        forwardAll = function() {
            var cnt = 0;
            log.debug("Start queueing users");
            User.scan(
                function(user) {
                    cnt++;
                    q.push(user, function(err) {
                        if (err) {
                            log.error({err: err, user: user.id}, "Error forwarding activities");
                        } else {
                            log.debug({user: user.id}, "Done forwarding");
                        }
                    });
                },
                function(err) {
                    if (err) {
                        log.error({err: err}, "Error queueing users.");
                    } else {
                        log.debug({userCount: cnt}, "Done queueing users");
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
                            ForeignUser.readArray(ids, callback);
                        },
                        function(snus, callback) {
                            var autos = _.filter(snus, function(snu) { return snu.autopost; });
                            callback(null, autos);
                        }
                    ], callback);
                },
                getNewActivities = function(callback) {
                    var items = null;
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
                                callback(new Error("Error " + response.statusCode + ": " + data));
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
                            items = feed.items;
                            if (items && items.length > 0) {
                                user.lastseen = items[0].id;
                                user.save(callback);
                            } else {
                                callback(null, null);
                            }
                        }
                    ], function(err) {
                        if (err) {
                            callback(err, null);
                        } else {
                            callback(null, items);
                        }
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
                        log.debug({autos: _.pluck(autos, "id"), user: user.id}, "Accounts updating automatically.");
                        getNewActivities(callback);
                    } else {
                        // We can skip costly requests if we're not forwarding the activities
                        log.debug({user: user.id}, "No autos; skipping polling.");
                        callback(null, []);
                    }
                },
                function(results, callback) {
                    var ppnas = results;
                    log.debug({ppnas: ppnas.length, user: user.id}, "Activities to forward.");
                    async.each(ppnas, function(ppna, callback) {
                        async.each(autos, function(auto, callback) {
                            log.info({ppna: ppna.id, auto: auto.id, user: user.id}, "Forwarding activity for user.");
                            auto.forwardActivity(ppna, site, function(err) {
                                if (err) {
                                    log.error({user: user.id, fuser: auto.id, activity: ppna.id, err: err});
                                } else {
                                    log.debug({user: user.id, fuser: auto.id, activity: ppna.id}, "Forwarded");
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
        log.debug("Starting forwarder.");
        // Do this every 15 minutes
        setInterval(forwardAll, options.interval);
        // Do one at the beginning
        forwardAll();
        return;
    };
};

module.exports = Forwarder;
