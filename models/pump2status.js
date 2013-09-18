// pump2status.js
//
// data object representing the app itself
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

var Pump2Status = {

    name: null,

    hostname: null,

    description: null,

    protocol: "http",

    url: function(rel) {
        var app = this;
        return app.protocol + "://" + app.hostname + rel;
    },

    asService: function() {

        var app = this;

        return {
            objectType: "service", // XXX: "app"?
            displayName: app.name,
            id: app.url("/"),
            url: app.url("/"),
            description: app.description
        };
    }
};

module.exports = Pump2Status;
