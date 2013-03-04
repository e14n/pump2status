// totalcount.js
//
// snapshot of the count of users on the whole network at a particular time
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

var TotalCount = DatabankObject.subClass("totalcount");

TotalCount.schema = {
    "totalcount": {
        pkey: "created",
        fields: [
            "created",
            "count"
        ]
    },
    "lasttotalcount": {
        pkey: "id",
        fields: [
            "created",
            "count"
        ]
    }
};

TotalCount.beforeCreate = function(props, callback) {
    if (!_.has(props, "count")) {
        callback(new Error("Need a count"), null);
        return;
    }
    props.created = Date.now();
    callback(null, props);
};

TotalCount.prototype.afterCreate = function(callback) {
    var tc = this,
        bank = TotalCount.bank();
    
    bank.save("lasttotalcount", 0, {created: tc.created, count: tc.count}, function(err, ltc) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

module.exports = TotalCount;
