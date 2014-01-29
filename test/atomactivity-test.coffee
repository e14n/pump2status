# atomactivity-test.coffee
#
# Vows test for the atomactivity module
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
 
vows = require("vows")
assert = require("assert")
suite = vows.describe("AtomActivity library test")

suite.addBatch "When we require the atomactivity module":
  topic: ->
    require "../lib/atomactivity"

  "it returns the AtomActivity class": (AtomActivity) ->
    assert.isFunction AtomActivity
    return

  "and we create an AtomActivity":
    topic: (AtomActivity) ->
      json =
        id: "tag:pump2status.net,2013:test:activity:1"
        actor:
          id: "tag:pump2status.net,2013:test:person:1"
          displayName: "Test person"

        verb: "post"
        object:
          id: "tag:pump2status.net,2013:test:note:1"
          objectType: "note"
          content: "Hello, world!"

      new AtomActivity(json)

    "it works": (act) ->
      assert.isObject act
      return

    "and we call its toString() method":
      topic: (act) ->
        act.toString()

      "it works": (str) ->
        assert.isString str
        return

suite["export"] module
