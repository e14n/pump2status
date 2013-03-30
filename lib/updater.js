// updater.js
//
// Updates the state of the world
//
// Copyright 2013, StatusNet Inc.
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
    Pump2Status = require("../models/pump2status"),
    StatusNetUser = require("../models/statusnetuser");

var ignore = function(err) {};

var S = 1000;
var M = 60 * S;
var H = 60 * M;

var Updater = function(options) {
    var log = options.log.child({component: "updater"}),
        updateAll = function() {
            log.info("Start queueing users");
            StatusNetUser.scan(
                function(snu) {
                    q.push(snu, function(err) {
                        if (err) {
                            log.error(err);
                        } else {
                            log.info({snu: snu.id}, "Done updating");
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
        updateFollowing = function(snu, callback) {
            snu.updateFollowing(callback);
        },
        q = async.queue(updateFollowing, 25);

    this.start = function() {
        // Do this every 12 hours
        setInterval(updateAll, 12 * H);
        // Do one at the beginning
        updateAll();
        return;
    };
};

module.exports = Updater;
