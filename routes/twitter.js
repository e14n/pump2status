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

var addRoutes = function(app, options) {

    var foreign = options.foreign,
        TwitterUser = options.ForeignUser,
        Twitter = options.ForeignHost,
        addAccount = function(req, res, next) {
            Twitter.getRequestToken(req.site, function(err, rt) {
                if (err) {
                    next(err);
                } else {
                    res.redirect(Twitter.authorizeURL(rt));
                }
            });
        },
        authorizedForTwitter = function(req, res, next) {

            var hostname = "twitter.com",
                token = req.query.oauth_token,
                verifier = req.query.oauth_verifier,
                problem = req.query.oauth_problem,
                user = req.user,
                rt,
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
                    RequestToken.get(RequestToken.key(hostname, token), callback);
                },
                function(results, callback) {
                    rt = results;
                    Twitter.getAccessToken(req.site, rt, verifier, callback);
                },
                function(token, secret, extra, callback) {
                    access_token = token;
                    token_secret = secret;
                    async.parallel([
                        function(callback) {
                            rt.del(callback);
                        },
                        function(callback) {
                            Twitter.whoami(req.site, access_token, token_secret, callback);
                        }
                    ], callback);
                },
                function(results, callback) {
                    object = results[1];
                    TwitterUser.fromUser(object, access_token, token_secret, callback);
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

    app.log.debug("Initializing Twitter routes");

    app.get('/add-account', userAuth, userRequired, addAccount);
    app.get('/authorized-for-twitter', userAuth, userRequired, authorizedForTwitter);
};

exports.addRoutes = addRoutes;
