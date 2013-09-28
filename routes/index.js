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
    StatusNet = require("../models/statusnet"),
    StatusNetUser = require("../models/statusnetuser"),
    PumpIOClientApp = require("pump.io-client-app"),
    RequestToken = PumpIOClientApp.RequestToken;

exports.addAccount = function(req, res) {
    res.render('add-account', { title: "Add Account", user: req.user });
};

exports.handleAddAccount = function(req, res, next) {

    var id = req.body.webfinger,
        hostname = StatusNetUser.getHostname(id),
        sn;

    async.waterfall([
        function(callback) {
            StatusNet.ensureStatusNet(hostname, callback);
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
};

exports.authorizedStatusNet = function(req, res, next) {

    var hostname = req.params.hostname,
        token = req.query.oauth_token,
        verifier = req.query.oauth_verifier,
        problem = req.query.oauth_problem,
        user = req.user,
        rt,
        sn,
        snuser,
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
                    StatusNet.get(hostname, callback);
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
            StatusNetUser.fromUser(object, access_token, token_secret, callback);
        },
        function(results, callback) {
            snuser = results;
            user.associate(snuser, callback);
        },
        function(callback) {
            snuser.beFound(callback);
        },
        function(callback) {
            snuser.updateFollowing(callback);
        }
    ], function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/find-friends/"+snuser.id);
        }
    });
};

exports.findFriends = function(req, res, next) {

    var snuser = req.snuser,
        found;

    snuser.findFriends(function(err, found) {
        if (err) {
            next(err);
        } else {
            if (found.length === 0) {
                res.render('no-friends', {title: "Pump2Status - No Friends Found",
                                          user: req.user,
                                          snuser: snuser});
            } else {
                res.render('find-friends', {title: "Pump2Status - Find Friends",
                                            user: req.user,
                                            snuser: snuser,
                                            found: found});
            }
        }
    });
};

exports.saveFriends = function(req, res, next) {

    var user = req.user,
        snuser = req.snuser,
        body = req.body,
        found;

    async.waterfall([
        function(callback) {
            snuser.findFriends(callback);
        },
        function(found, callback) {
            var chosen = _.filter(found, function(account) {
                var id = account.id.toLowerCase().replace(/[\.@]/g, '_');
                return body[id] === 'on';
            });
            async.forEachLimit(chosen,
                               10,
                               function(account, callback) {
                                   user.follow(account, callback);
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
};

exports.settings = function(req, res) {
    res.render('settings', {title: "Settings for " + req.snuser.id,
                            saved: false,
                            snuser: req.snuser,
                            user: req.user});
};

exports.saveSettings = function(req, res, next) {
    var autopost = _.has(req.body, "autopost"),
        snuser = req.snuser;

    async.waterfall([
        function(callback) {
            snuser.autopost = autopost;
            snuser.save(callback);
        }
    ], function(err, snuser) {
        if (err) {
            next(err);
        } else {
            res.render('settings', {title: "Settings for " + req.snuser.id,
                                    saved: true,
                                    snuser: req.snuser,
                                    user: req.user});
        }
    });
    
};
