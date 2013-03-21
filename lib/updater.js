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
    HostCount = require("../models/hostcount"),
    TotalCount = require("../models/totalcount"),
    Pump2Status = require("../models/pump2status");

var ignore = function(err) {};

var S = 1000;
var M = 60 * S;
var H = 60 * M;

var Updater = function(options) {

    var log = options.log.child({component: "updater"}),
        logError = function(err) {
            if (err) {
                log.error(err);
            }
        },
        updateAll = function() {
            var bank = Host.bank();
            async.waterfall([
                function(callback) {
                    bank.read("hostlist", 0, callback);
                },
                function(hosts, callback) {
                    var cnt = hosts.length,
                        total = 0,
                        done = 0;
                    _.each(hosts, function(host) {
                        hostQueue.push(host, function(err, hostcnt) {
                            if (err) {
                                logError(err);
                            } else {
                                total += hostcnt;
                            }
                            done++;
                            if (done >= cnt) {
                                log.info({count: total}, "Save total count");
                                TotalCount.create({count: total}, callback);
                            }
                        });
                    });
                }], logError);
        },
        updateHost = function(hostname, callback) {
            var cnt = 0;
            async.waterfall(
                [
                    function(callback) {
                        Host.ensureHost(hostname, callback);
                    },
                    function(host, callback) {
                        var oa = host.getOAuth();
                        log.info({hostname: hostname}, "Querying user count");
                        oa.get("http://"+hostname+"/api/users", null, null, callback);
                    },
                    function(doc, resp, callback) {
                        var obj = JSON.parse(doc);
                        cnt = obj.totalItems;
                        log.info({hostname: hostname, count: cnt}, "Save user count");
                        HostCount.create({hostname: hostname, count: cnt}, callback);
                    }
                ],
                function(err) {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, cnt);
                    }
                }
            );
        },
        hostQueue = async.queue(updateHost, 25);
    
    hostQueue.drain = function() {
        log.info("Host queue empty.");
    };

    this.start = function() {
        // Do this every 15 minutes
        setInterval(updateAll, 15 * M);
        // Do one right now
        updateAll();
    };
};

Updater.EMPTY_NOTIFICATION_TIME = 24 * H;

module.exports = Updater;
