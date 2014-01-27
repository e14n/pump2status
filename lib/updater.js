// updater.js
//
// Updates the state of the world
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
    LinkError = require("./linkerror");

var ignore = function(err) {};

var Updater = function(options) {
    var log = options.log.child({component: "updater"}),
        site = options.site,
        ForeignUser = options.ForeignUser,
        ForeignHost = options.ForeignHost,
        updateAll = function() {
            log.debug("Start queueing users");
            ForeignUser.scan(
                function(snu) {
                    q.push(snu, function(err) {
                        if (err) {
                            log.error({err: err, snu: snu.id}, "Error updating foreign user");
                            if (err instanceof LinkError) {
                                log.info({err: err, snu: snu.id}, "Deleting disconnected foreign user");
                                snu.del(function(err) {
                                    if (err) {
                                        log.error({err: err, snu: snu.id}, "Error deleting disconnected foreign user");
                                    } else {
                                        log.info({err: err, snu: snu.id}, "Deleted disconnected foreign user");
                                    }
                                });
                            }
                        } else {
                            log.debug({snu: snu.id}, "Done updating");
                        }
                    });
                },
                function(err) {
                    if (err) {
                        log.error(err);
                    } else {
                        log.debug("Done queueing users");
                    }
                }
            );
        },
        updateFollowing = function(snu, callback) {
            snu.updateFollowing(site, callback);
        },
        q = async.queue(updateFollowing, 25);

    this.start = function() {
        // Do this every 12 hours
        setInterval(updateAll, options.interval);
        // Do one at the beginning
        updateAll();
        return;
    };
};

module.exports = Updater;
