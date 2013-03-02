// user.js
//
// data object representing an user
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
    PumpLive = require("./pumplive"),
    Host = require("./host"),
    Plot = require("./plot");

var User = DatabankObject.subClass("user");

User.schema = {
    "user": {
        pkey: "id",
        fields: ["name",
                 "coins",
                 "plots",
                 "token",
                 "secret",
                 "inbox",
                 "outbox",
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

    if (!person.followers ||
        !person.followers.url) {
        callback(new Error("No followers."));
        return;
    }

    async.waterfall([
        function(callback) {
            Plot.create({owner: id}, callback);
        },
        function(plot, callback) {
            User.create({id: id,
                           name: person.displayName,
                           homepage: person.url,
                           coins: 25,
                           plots: [plot.uuid],
                           token: token,
                           secret: secret,
                           created: Date.now(),
                           updated: Date.now(),
                           inbox: person.links["activity-inbox"].href,
                           outbox: person.links["activity-outbox"].href,
                           followers: person.followers.url},
                          callback);
        }
    ], callback);
};

// Keep a list of existing users so we can do periodic updates

User.prototype.afterCreate = function(callback) {
    var user = this,
        bank = User.bank();

    bank.append("userlist", 0, user.id, function(err, list) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

// Deleted users come off the list

User.prototype.afterDel = function(callback) {
    var user = this;

    async.parallel([
        function(callback) {
            var bank = User.bank();
            bank.remove("userlist", 0, user.id, callback);
        },
        function(callback) {
            var bank = Plot.bank();
            async.forEach(user.plots,
                          function(plotID, callback) {
                              bank.del("plot", plotID, callback);
                          },
                          callback);
        }
    ], function(err, results) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

User.prototype.joinActivity = function(callback) {
    var user = this,
        game = PumpLive.asService(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " joined " +
            "<a href='" + game.url + "'>" + game.displayName + "</a>";

    user.postActivity({verb: "join",
                         content: content,
                         object: game},
                        callback);
};

User.prototype.buyActivity = function(plot, callback) {
    var user = this,
        obj = plot.asObject(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " bought " + 
            "<a href='" + obj.url + "'>a new plot</a>";

    user.postActivity({verb: "purchase",
                         content: content,
                         object: obj},
                         callback);
};

User.prototype.plantActivity = function(crop, callback) {
    var user = this,
        obj = crop.asObject(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " planted " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    user.postActivity({verb: "http://pumplive.com/schema/verb/plant",
                         content: content,
                         object: obj},
                         callback);
};

User.prototype.tearUpActivity = function(crop, callback) {
    var user = this,
        obj = crop.asObject(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " tore up a field of " + 
             obj.displayName;

    user.postActivity({verb: "http://pumplive.com/schema/verb/tear-up",
                         content: content,
                         object: obj},
                         callback);
};

User.prototype.waterActivity = function(crop, callback) {
    var user = this,
        obj = crop.asObject(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " watered " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    user.postActivity({verb: "http://pumplive.com/schema/verb/water",
                         content: content,
                         object: obj},
                         callback);
};

User.prototype.harvestActivity = function(crop, callback) {
    var user = this,
        obj = crop.asObject(),
        content = "<a href='" + user.homepage + "'>" + user.name + "</a> " + 
            " harvested " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    user.postActivity({verb: "http://pumplive.com/schema/verb/harvest",
                         content: content,
                         object: obj},
                         callback);
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

module.exports = User;
