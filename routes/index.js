// index.js
//
// Most of the routes in the application
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

var async = require("async"),
    _ = require("underscore"),
    Shadow = require("../models/shadow"),
    PumpIOClientApp = require("pump.io-client-app"),
    RequestToken = PumpIOClientApp.RequestToken,
    userAuth = PumpIOClientApp.userAuth,
    userOptional = PumpIOClientApp.userOptional,
    userRequired = PumpIOClientApp.userRequired,
    noUser = PumpIOClientApp.noUser;

var userIsFuser = function(req, res, next) {
    
    Shadow.get(req.fuser.id, function(err, shadow) {
        if (err) {
            next(err);
        } else if (shadow.pumpio != req.user.id) {
            next(new Error("Must be same user"));
        } else {
            next();
        }
    });
};

var addRoutes = function(app, options) {

    var foreign = options.foreign,
        ForeignUser = options.ForeignUser,
        ForeignHost = options.ForeignHost,
        findFriends = function(req, res, next) {

            var fuser = req.fuser,
                found;

            fuser.findFriends(function(err, found) {
                if (err) {
                    next(err);
                } else {
                    if (found.length === 0) {
                        res.render('no-friends', {title: "No Friends Found",
                                                  user: req.user,
                                                  fuser: fuser});
                    } else {
                        res.render('find-friends', {title: "Find Friends",
                                                    user: req.user,
                                                    fuser: fuser,
                                                    found: found});
                    }
                }
            });
        },
        saveFriends = function(req, res, next) {

            var user = req.user,
                fuser = req.fuser,
                body = req.body,
                found;

            async.waterfall([
                function(callback) {
                    fuser.findFriends(callback);
                },
                function(found, callback) {
                    var chosen = _.filter(found, function(account) {
                        var id = account.id.toLowerCase().replace(/[\.@]/g, '_');
                        return body[id] === 'on';
                    });
                    async.forEachLimit(chosen,
                                       10,
                                       function(account, callback) {
                                           user.postActivity({verb: "follow", object: {objectType: "person", id: account.id}}, callback);
                                       },
                                       callback);
                }
            ], function(err) {
                if (err) {
                    next(err);
                } else {
                    res.redirect("/");
                }
            });
        },
        settings = function(req, res) {
            res.render('settings', {title: "Settings for " + req.fuser.id,
                                    saved: false,
                                    fuser: req.fuser,
                                    user: req.user});
        },
        saveSettings = function(req, res, next) {
            var autopost = _.has(req.body, "autopost"),
                fuser = req.fuser;

            async.waterfall([
                function(callback) {
                    fuser.autopost = autopost;
                    fuser.save(callback);
                }
            ], function(err, fuser) {
                if (err) {
                    next(err);
                } else {
                    res.render('settings', {title: "Settings for " + req.fuser.id,
                                            saved: true,
                                            fuser: req.fuser,
                                            user: req.user});
                }
            });
        };
    
    // Routes

    app.log.debug("Initializing default routes");

    app.get('/find-friends/:fuid', userAuth, userRequired, userIsFuser, findFriends);
    app.post('/find-friends/:fuid', userAuth, userRequired, userIsFuser, saveFriends);
    app.get('/settings/:fuid', userAuth, userRequired, userIsFuser, settings);
    app.post('/settings/:fuid', userAuth, userRequired, userIsFuser, saveSettings);
};

exports.addRoutes = addRoutes;
