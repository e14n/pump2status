// app.js
//
// pump2status entrypoint
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

var fs = require("fs"),
    path = require("path"),
    async = require("async"),
    _ = require("underscore"),
    routes = require('./routes'),
    databank = require("databank"),
    Databank = databank.Databank,
    DatabankObject = databank.DatabankObject,
    PumpIOClientApp = require("pump.io-client-app"),
    StatusNetUser = require("./models/statusnetuser"),
    StatusNet = require("./models/statusnet"),
    Shadow = require("./models/shadow"),
    Edge = require("./models/edge"),
    Updater = require("./lib/updater"),
    Forwarder = require("./lib/forwarder"),
    config,
    defaults = {
        name: "Pump2Status",
        description: "Find your StatusNet friends on pump.io.",
        forwardInterval: 15 * 60 * 1000,
        updateInterval: 12 * 60 * 60 * 1000,
        params: {},
        views: path.join(__dirname, "views"),
        static: path.join(__dirname, "public")
    },
    userAuth = PumpIOClientApp.userAuth,
    userOptional = PumpIOClientApp.userOptional,
    userRequired = PumpIOClientApp.userRequired,
    noUser = PumpIOClientApp.noUser;

if (fs.existsSync("/etc/pump2status.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/pump2status.json")),
                        defaults);
} else {
    config = defaults;
}

if (!config.params.schema) {
    config.params.schema = {};
}

// Now, our stuff

_.each([StatusNetUser, StatusNet, Shadow, Edge], function(Cls) {
    config.params.schema[Cls.type] = Cls.schema;
});

// sets up the config

var app = new PumpIOClientApp(config);

// Attach shadows to the user

var oldAfterGet = PumpIOClientApp.User.prototype.afterGet;

PumpIOClientApp.User.prototype.afterGet = function(callback) {
    var user = this;

    async.waterfall([
        function(callback) {
            // Call the default hook first
            oldAfterGet.call(user, callback);
        },
        function(callback) {
            Shadow.search({pumpio: user.id}, callback);
        },
        function(shadows, callback) {
            StatusNetUser.readArray(_.pluck(shadows, "statusnet"), callback);
        }
    ], function(err, statusnetusers) {
        if (err) {
            callback(err);
        } else {
            user.shadows = statusnetusers;
            callback(null);
        }
    });
};

// Our params

app.param("snuid", function(req, res, next, snuid) {
    StatusNetUser.get(snuid, function(err, snuser) {
        if (err) {
            next(err);
        } else {
            req.snuser = snuser;
            next();
        }
    });
});

var userIsSnuser = function(req, res, next) {
    
    Shadow.get(req.snuser.id, function(err, shadow) {
        if (err) {
            next(err);
        } else if (shadow.pumpio != req.user.id) {
            next(new Error("Must be same user"));
        } else {
            next();
        }
    });
};

// Routes

app.log.info("Initializing routes");

app.get('/add-account', userAuth, userRequired, routes.addAccount);
app.post('/add-account', userAuth, userRequired, routes.handleAddAccount);
app.get('/authorized/statusnet/:hostname', userAuth, userRequired, routes.authorizedStatusNet);
app.get('/find-friends/:snuid', userAuth, userRequired, userIsSnuser, routes.findFriends);
app.post('/find-friends/:snuid', userAuth, userRequired, userIsSnuser, routes.saveFriends);
app.get('/settings/:snuid', userAuth, userRequired, userIsSnuser, routes.settings);
app.post('/settings/:snuid', userAuth, userRequired, userIsSnuser, routes.saveSettings);

// updater -- keeps the world up-to-date
// XXX: move to master process when clustering

app.log.info("Initializing updater");

app.updater = new Updater({log: app.log, site: app.site, interval: config.updateInterval});
app.forwarder = new Forwarder({log: app.log, site: app.site, interval: config.forwardInterval});

// Start the app

app.log.info({port: config.port, address: config.address}, "Starting app listener");

app.run(function(err) {
    if (err) {
        app.log.error(err);
    } else {
        console.log("Express server listening on address %s port %d", config.address, config.port);
        app.updater.start();
        app.forwarder.start();
    }
});    
