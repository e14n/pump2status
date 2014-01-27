# edge.js
#
# A network edge between users in OStatus or pump.io graph
#
# Copyright 2013, E14N (https://e14n.com/)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
_ = require("underscore")
async = require("async")
DatabankObject = require("databank").DatabankObject
Edge = DatabankObject.subClass("edge")
Edge.schema =
  pkey: "from_to"
  fields: [
    "from"
    "to"
    "created"
    "received"
  ]
  indices: [
    "from"
    "to"
  ]

Edge.beforeCreate = (props, callback) ->
  if not props.from or not props.to
    callback new Error("Need 'from' and 'to' in an edge'"), null
    return
  props.from_to = Edge.key(props.from, props.to)
  props.received = Date.now()
  callback null, props
  return

Edge::beforeSave = (callback) ->
  edge = this
  if not edge.from or not edge.to
    callback new Error("Need 'from' and 'to' in an edge'"), null
    return
  edge.from_to = Edge.key(edge.from, edge.to)
  edge.received = Date.now()  unless edge.received
  callback null
  return

Edge.key = (fromId, toId) ->
  fromId + "→" + toId

module.exports = Edge
