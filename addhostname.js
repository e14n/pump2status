// app.js
//
// main function for live updates
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

var fs = require("fs"),
    async = require("async"),
    path = require("path"),
    _ = require("underscore"),
    express = require('express'),
    DialbackClient = require("dialback-client"),
    Logger = require("bunyan"),
    databank = require("databank"),
    Databank = databank.Databank,
    DatabankObject = databank.DatabankObject,
    DatabankStore = require('connect-databank')(express),
    RequestToken = require("./models/requesttoken"),
    User = require("./models/user"),
    Host = require("./models/host"),
    HostCount = require("./models/hostcount"),
    TotalCount = require("./models/totalcount"),
    config,
    defaults = {
        port: 4000,
        address: "localhost",
        hostname: "localhost",
        driver: "disk",
        name: "Pump Live",
        description: "Stats server for the social web."
    },
    log,
    logParams = {
        name: "pumplive",
        component: "addhostname",
        serializers: {
            req: Logger.stdSerializers.req,
            res: Logger.stdSerializers.res
        }
    },
    hostname;

if (process.argv.length < 3) {
    console.log("USAGE: addhostname.js <hostname>");
    process.exit(1);
}

hostname = process.argv[2];

if (fs.existsSync("/etc/pumplive.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/pumplive.json")),
                        defaults);
} else {
    config = defaults;
}

if (config.logfile) {
    logParams.streams = [{path: config.logfile}];
} else if (config.nologger) {
    logParams.streams = [{path: "/dev/null"}];
} else {
    logParams.streams = [{stream: process.stderr}];
}

log = new Logger(logParams);

log.info("Initializing addhostname.js");

if (!config.params) {
    if (config.driver == "disk") {
        config.params = {dir: "/var/lib/pumplive/"};
    } else {
        config.params = {};
    }
}

// Define the database schema

if (!config.params.schema) {
    config.params.schema = {};
}

_.extend(config.params.schema, DialbackClient.schema);
_.extend(config.params.schema, DatabankStore.schema);

// Now, our stuff

_.each([RequestToken, Host], function(Cls) {
    config.params.schema[Cls.type] = Cls.schema;
});

// User has a global list

_.extend(config.params.schema, User.schema);
_.extend(config.params.schema, Host.schema);
_.extend(config.params.schema, HostCount.schema);
_.extend(config.params.schema, TotalCount.schema);

var db = Databank.get(config.driver, config.params);

async.waterfall(
    [
        function(callback) {
            log.info({driver: config.driver, params: config.params}, "Connecting to DB");
            db.connect({}, callback);
        },
        function(callback) {
            db.append("hostlist", 0, hostname, callback);
        },
        function(callback) {
            db.disconnect(callback);
        }
    ],
    function(err) {
        if (err) {
            log.error(err);
        } else {
            process.exit(0);
        }
    }
);
