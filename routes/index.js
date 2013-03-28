// index.js
//
// Most of the routes in the application
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

var wf = require("webfinger"),
    async = require("async"),
    _ = require("underscore"),
    uuid = require("node-uuid"),
    User = require("../models/user"),
    Host = require("../models/host"),
    StatusNet = require("../models/statusnet"),
    StatusNetUser = require("../models/statusnetuser"),
    RequestToken = require("../models/requesttoken"),
    Pump2Status = require("../models/pump2status");

exports.hostmeta = function(req, res) {
    res.json({
        links: [
            {
                rel: "dialback",
                href: Pump2Status.url("/dialback")
            }
        ]
    });
};

exports.index = function(req, res, next) {
    if (req.user) {
        res.render('userindex', { title: "Pump2Status", user: req.user, bridged: [] });
    } else {
        res.render('index', { title: "Pump2Status" });
    }
};

exports.about = function(req, res) {
    res.render('about', { title: 'About Pump2Status' });
};

exports.login = function(req, res) {
    res.render('login', { title: 'Login' });
};

exports.handleLogin = function(req, res, next) {

    var id = req.body.webfinger,
        hostname = User.getHostname(id),
        host;
    
    async.waterfall([
        function(callback) {
            Host.ensureHost(hostname, callback);
        },
        function(results, callback) {
            host = results;
            host.getRequestToken(callback);
        }
    ], function(err, rt) {
        if (err) {
            if (err instanceof Error) {
                next(err);
            } else if (err.data) {
                next(new Error(err.data));
            }
        } else {
            res.redirect(host.authorizeURL(rt));
        }
    });
};

exports.authorized = function(req, res, next) {

    var hostname = req.params.hostname,
        token = req.query.oauth_token,
        verifier = req.query.oauth_verifier,
        rt,
        host,
        access_token,
        token_secret,
        id,
        object,
        newUser = false;

    async.waterfall([
        function(callback) {
            async.parallel([
                function(callback) {
                    RequestToken.get(RequestToken.key(hostname, token), callback);
                },
                function(callback) {
                    Host.get(hostname, callback);
                }
            ], callback);
        },
        function(results, callback) {
            rt = results[0];
            host = results[1];
            host.getAccessToken(rt, verifier, callback);
        },
        function(token, secret, extra, callback) {
            access_token = token;
            token_secret = secret;
            async.parallel([
                function(callback) {
                    rt.del(callback);
                },
                function(callback) {
                    host.whoami(access_token, token_secret, callback);
                }
            ], callback);
        },
        function(results, callback) {
            object = results[1];
            id = object.id;
            if (id.substr(0, 5) == "acct:") {
                id = id.substr(5);
            }
            User.get(id, function(err, user) {
                if (err && err.name === "NoSuchThingError") {
                    newUser = true;
                    User.fromPerson(object, access_token, token_secret, callback);
                } else if (err) {
                    callback(err, null);
                } else {
                    callback(null, user);
                }
            });
        }
    ], function(err, user) {
        if (err) {
            next(err);
        } else {
            req.session.userID = user.id;
            res.redirect("/");
        }
    });
};

exports.handleLogout = function(req, res) {

    delete req.session.userID;
    delete req.user;

    res.redirect("/", 303);
};

exports.addAccount = function(req, res) {
    res.render('add-account', { title: "Add Account", user: req.user });
};

exports.handleAddAccount = function(req, res, next) {

    var id = req.body.webfinger,
        hostname = User.getHostname(id),
        sn;

    async.waterfall([
        function(callback) {
            StatusNet.ensureStatusNet(hostname, callback);
        },
        function(results, callback) {
            sn = results;
            sn.getRequestToken(callback);
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
        user = req.user,
        rt,
        sn,
        snuser,
        access_token,
        token_secret,
        id,
        object,
        newUser = false;

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
            sn.getAccessToken(rt, verifier, callback);
        },
        function(token, secret, extra, callback) {
            access_token = token;
            token_secret = secret;
            async.parallel([
                function(callback) {
                    rt.del(callback);
                },
                function(callback) {
                    sn.whoami(access_token, token_secret, callback);
                }
            ], callback);
        },
        function(results, callback) {
            object = results;
            StatusNetUser.fromUser(object, access_token, token_secret, callback);
        },
        function(results, callback) {
            snuser = results;
            user.associate(snuser, callback);
        },
        function(callback) {
            async.parallel([
                function(callback) {
                    snuser.beFound(callback);
                },
                function(callback) {
                    snuser.updateFollowing(callback);
                }
            ], callback);
        }
    ], function(err, user) {
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
            res.render('find-friends', {title: "Pump2Status - Find Friends",
                                        user: req.user,
                                        snuser: snuser,
                                        found: found});
        }
    });
};
