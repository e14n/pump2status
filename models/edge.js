// edge.js
//
// A network edge between users in OStatus or pump.io graph
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
    DatabankObject = require("databank").DatabankObject;

var Edge = DatabankObject.subClass("edge");

Edge.schema = {
    pkey: "from_to",
    fields: ["from", "to", "created", "received"],
    indices: ["from", "to"]
};

Edge.beforeCreate = function(props, callback) {
    props.received = Date.now();
    props.from_to = Edge.key(props.from, props.to);
    callback(null, props);
};

Edge.key = function(fromId, toId) {
    return fromId + "→" + toId;
};

module.exports = Edge;
