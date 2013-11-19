// routes/statusnet.js
//
// Routes for logging in to a StatusNet account
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

var addRoutes = function(app, options) {

    var foreign = options.foreign,
        ForeignUser = options.ForeignUser,
        ForeignHost = options.ForeignHost,
        addAccount = function(req, res) {
            res.render('add-account', { title: "Add Account", user: req.user });
        },
        handleAddAccount = function(req, res, next) {

            var id = req.body.webfinger,
                hostname = ForeignUser.getHostname(id),
                sn;

            async.waterfall([
                function(callback) {
                    ForeignHost.ensureForeignHost(hostname, callback);
                },
                function(results, callback) {
                    sn = results;
                    sn.getRequestToken(req.site, callback);
                }
            ], function(err, rt) {
                if (err) {
                    if (err instanceof Error) {
                        next(err);
                    } else if (err.data) {
                        next(new Error(err.data));
                    }
                } else {
                    res.redirect(sn.authorizeURL(rt));
                }
            });
        },
        authorizedForeignHost = function(req, res, next) {

            var hostname = req.params.hostname,
                token = req.query.oauth_token,
                verifier = req.query.oauth_verifier,
                problem = req.query.oauth_problem,
                user = req.user,
                rt,
                sn,
                fuser,
                access_token,
                token_secret,
                id,
                object,
                newUser = false;

            if (!token) {
                next(new Error("No token returned."));
                return;
            }

            async.waterfall([
                function(callback) {
                    async.parallel([
                        function(callback) {
                            RequestToken.get(RequestToken.key(hostname, token), callback);
                        },
                        function(callback) {
                            ForeignHost.get(hostname, callback);
                        }
                    ], callback);
                },
                function(results, callback) {
                    rt = results[0];
                    sn = results[1];
                    sn.getAccessToken(req.site, rt, verifier, callback);
                },
                function(token, secret, extra, callback) {
                    access_token = token;
                    token_secret = secret;
                    async.parallel([
                        function(callback) {
                            rt.del(callback);
                        },
                        function(callback) {
                            sn.whoami(req.site, access_token, token_secret, callback);
                        }
                    ], callback);
                },
                function(results, callback) {
                    object = results[1];
                    ForeignUser.fromUser(object, access_token, token_secret, callback);
                },
                function(results, callback) {
                    fuser = results;
                    Shadow.create({statusnet: fuser.id, pumpio: user.id}, callback);
                },
                function(shadow, callback) {
                    fuser.beFound(callback);
                },
                function(callback) {
                    fuser.updateFollowing(req.site, callback);
                }
            ], function(err) {
                if (err) {
                    next(err);
                } else {
                    res.redirect("/find-friends/"+fuser.id);
                }
            });
        };
    
    // Routes

    app.log.debug("Initializing statusnet routes");

    app.get('/add-account', userAuth, userRequired, addAccount);
    app.post('/add-account', userAuth, userRequired, handleAddAccount);
    app.get('/authorized/'+foreign+'/:hostname', userAuth, userRequired, authorizedForeignHost);
};

exports.addRoutes = addRoutes;
