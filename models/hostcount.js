// hostcount.js
//
// snapshot of the count of users on a host a particular time
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
    DatabankObject = require("databank").DatabankObject;

var HostCount = DatabankObject.subClass("hostcount");

HostCount.schema = {
    "hostcount": {
        pkey: "hostname_created",
        fields: [
            "hostname",
            "created",
            "count"
        ],
        indices: ["hostname"]
    },
    "lasthostcount": {
        pkey: "hostname",
        fields: [
            "created",
            "count"
        ]
    }
};

HostCount.toKey = function(hostname, created) {
    return hostname + "/" + created;
};

HostCount.beforeCreate = function(props, callback) {
    if (!props.hostname || !_.has(props, "count")) {
        callback(new Error("Need a hostname and a count"), null);
        return;
    }
    props.created = Date.now();
    props.hostname_created = HostCount.toKey(props.hostname, props.created);
    callback(null, props);
};

HostCount.prototype.afterCreate = function(callback) {
    var hc = this,
        bank = HostCount.bank();
    
    bank.save("lasthostcount", hc.hostname, {created: hc.created, count: hc.count}, function(err, lhc) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

module.exports = HostCount;
