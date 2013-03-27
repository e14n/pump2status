// statusnetuser.js
//
// data object representing an statusnetuser
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
    uuid = require("node-uuid"),
    DatabankObject = require("databank").DatabankObject,
    Pump2Status = require("./pump2status"),
    StatusNet = require("./statusnet"),
    Shadow = require("./shadow"),
    Edge = require("./edge"),
    User = require("./user");

var StatusNetUser = DatabankObject.subClass("statusnetuser");

StatusNetUser.schema = {
    "statusnetuser": {
        pkey: "id",
        fields: ["name",
                 "nickname",
                 "homepage",
                 "hostname",
                 "token",
                 "secret",
                 "following",
                 "created",
                 "updated"]
    }
};

StatusNetUser.fromUser = function(hostname, person, token, secret, callback) {

    var snu = new StatusNetUser(person);

    snu.id        = person.screen_name + "@" + hostname;
    snu.hostname  = hostname;
    snu.token     = token;
    snu.secret    = secret;
    // XXX: SSL?
    // XXX: index.php/ prefix?
    snu.following = 'http://'+hostname+'/api/statuses/friends/'+person.screen_name+'.json';

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

StatusNetUser.prototype.postActivity = function(act, callback) {
    callback(null, null);
};

StatusNetUser.prototype.beFound = function(callback) {
    var snu = this,
        user,
        shadow;

    async.waterfall([
        function(callback) {
            Shadow.get(snu.id, callback);
        },
        function(results, callback) {
            shadow = results;
            User.get(shadow.pumpio, callback);
        },
        // Find incoming edges
        function(results, callback) {
            user = results;
            Edge.search({to: snu.id}, callback);
        },
        // Find pump.io IDs of originators of these edges waiting for this user to join
        function(edges, callback) {
            var waiters = _.pluck(edges, "from");
            Shadow.readArray(waiters, callback);
        },
        // 
        function(shadows, callback) {
            var ids = _.pluck(shadows, "pumpio");
            // For each shadow, have it follow the pump.io account
            async.eachLimit(ids,
                            25,
                            function(id, callback) {
                                async.waterfall([
                                    function(callback) {
                                        User.get(id, callback);
                                    },
                                    function(waiter, callback) {
                                        waiter.follow(user, callback);
                                    }
                                ], callback);
                            },
                            callback);
        }
    ], callback);
};

StatusNetUser.prototype.updateFollowing = function(callback) {
    var snu = this,
        sn,
        oa;

    async.waterfall([
        function(callback) {
            snu.getHost(callback);
        },
        function(results, callback) {
            sn = results;
            oa = sn.getOAuth();
            oa.get(snu.following, snu.token, snu.secret, callback);
        },
        function(doc, resp, callback) {
            var following;
            try {
                following = JSON.parse(doc);
            } catch (e) {
                callback(e);
                return;
            };
            var ids = _.pluck(following, "statusnet_profile_url");
            // For each shadow, have it follow the pump.io account
            async.eachLimit(ids,
                            25,
                            function(id, callback) {
                                async.waterfall([
                                    function(callback) {
                                        User.get(id, callback);
                                    },
                                    function(waiter, callback) {
                                        waiter.follow(user, callback);
                                    }
                                ], callback);
                            },
                            callback);
        }
    ], callback);
};

module.exports = StatusNetUser;
