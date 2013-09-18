// user.js
//
// data object representing an user
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
    uuid = require("node-uuid"),
    DatabankObject = require("databank").DatabankObject,
    Pump2Status = require("./pump2status"),
    Host = require("./host"),
    Edge = require("./edge"),
    Shadow = require("./shadow");

var User = DatabankObject.subClass("user");

User.schema = {
    "user": {
        pkey: "id",
        fields: ["name",
                 "homepage",
                 "avatar",
                 "token",
                 "secret",
                 "inbox",
                 "outbox",
                 "following",
                 "created",
                 "updated"]
    },
    "userlist": {
        pkey: "id"
    }
};

User.fromPerson = function(person, token, secret, callback) {

    var id = person.id,
        user,
        bank = User.bank();

    if (id.substr(0, 5) == "acct:") {
        id = id.substr(5);
    }

    if (!person.links ||
        !person.links["activity-inbox"] ||
        !person.links["activity-inbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.links ||
        !person.links["activity-outbox"] ||
        !person.links["activity-outbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.following ||
        !person.following.url) {
        callback(new Error("No following."));
        return;
    }

    async.waterfall([
        function(callback) {
            User.create({id: id,
                         name: person.displayName,
                         homepage: person.url,
                         avatar: ((person.image && person.image.url) ? person.image.url : null),
                         token: token,
                         secret: secret,
                         created: Date.now(),
                         updated: Date.now(),
                         inbox: person.links["activity-inbox"].href,
                         outbox: person.links["activity-outbox"].href,
                         following: person.following.url},
                        callback);
        }
    ], callback);
};

User.getHostname = function(id) {
    var parts = id.split("@"),
        hostname = parts[1].toLowerCase();

    return hostname;
};

User.prototype.getHost = function(callback) {

    var user = this,
        hostname = User.getHostname(user.id);

    Host.get(hostname, callback);
};

User.prototype.postActivity = function(act, callback) {

    var user = this;

    async.waterfall([
        function(callback) {
            user.getHost(callback);
        },
        function(host, callback) {
            var oa = host.getOAuth(),
                json = JSON.stringify(act);

            oa.post(user.outbox, user.token, user.secret, json, "application/json", callback);
        },
        function(data, response, callback) {
            var posted;
            if (response.statusCode >= 400 && response.statusCode < 600) {
                callback(new Error("Error " + response.StatusCode + ": " + data));
            } else if (!response.headers || 
                       !response.headers["content-type"] || 
                       response.headers["content-type"].substr(0, "application/json".length) != "application/json") {
                callback(new Error("Not application/json"));
            } else {
                try {
                    posted = JSON.parse(data);
                    callback(null, posted);
                } catch (e) {
                    callback(e, null);
                }
            }
        }
    ], callback);
};

User.prototype.associate = function(snuser, callback) {

    var user = this,
        shadow = new Shadow({statusnet: snuser.id, pumpio: user.id});

    shadow.save(function(err) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

User.prototype.follow = function(other, callback) {

    var user = this;

    async.waterfall([
        function(callback) {
            user.postActivity({
                verb: "follow",
                object: {
                    objectType: "person",
                    id: "acct:" + other.id
                }
            }, callback);
        },
        function(act, callback) {
            var edge = new Edge({from: user.id, to: other.id});
            edge.save(callback);
        }
    ], function(err, edge) {
        callback(null, null);
    });
};

User.prototype.getShadows = function(callback) {

    var user = this,
        StatusNetUser = require("./statusnetuser"); // prevent loops

    async.waterfall([
        function(callback) {
            // Search... in the shadows!
            Shadow.search({pumpio: user.id}, callback);
        },
        function(shadows, callback) {
            var ids = _.pluck(shadows, "statusnet");
            StatusNetUser.readArray(ids, callback);
        }
    ], callback);
};

module.exports = User;
