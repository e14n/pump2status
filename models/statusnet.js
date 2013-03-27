// statusnet.js
//
// data object representing a remote StatusNet host
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

var _ = require("underscore"),
    wf = require("webfinger"),
    async = require("async"),
    qs = require("querystring"),
    OAuth = require("oauth").OAuth,
    DatabankObject = require("databank").DatabankObject,
    Host = require("./host"),
    Pump2Status = require("./pump2status"),
    RequestToken = require("./requesttoken");

var StatusNet = DatabankObject.subClass("statusnet");

StatusNet.schema = {
    "host": {
        pkey: "hostname",
        fields: ["client_id",
                 "client_secret",
                 "request_token_endpoint",
                 "access_token_endpoint",
                 "authorization_endpoint",
                 "whoami_endpoint",
                 "created",
                 "updated"]
    },
    "hostlist": {
        pkey: "id"
    }
};

StatusNet.ensureStatusNet = function(hostname, callback) {
    StatusNet.get(hostname, function(err, statusnet) {
        if (err && err.name == "NoSuchThingError") {
            StatusNet.discover(hostname, callback);
        } else if (err) {
            callback(err, null);
        } else {
            // XXX: update endpoints?
            callback(null, statusnet);
        }
    });
};

StatusNet.discover = function(hostname, callback) {

    var props = {
        hostname: hostname
    };

    async.waterfall([
        function(callback) {
            wf.hostmeta(hostname, callback);
        },
        function(jrd, callback) {
            _.extend(props, {
                request_token_endpoint: "http://"+hostname+"/api/oauth/request_token",
                access_token_endpoint: "http://"+hostname+"/api/oauth/access_token",
                authorization_endpoint: "http://"+hostname+"/api/oauth/authorize",
                whoami_endpoint: "http://"+hostname+"/api/account/verify_credentials.json"
            });
            if (_.has(StatusNet.credentials, hostname)) {
                _.extend(props, StatusNet.credentials[hostname]);
            } else {
                _.extend(props, {
                    client_id: "anonymous",
                    client_token: "anonymous"
                });
            }
            StatusNet.create(props, callback);
        }
    ], callback);
};

StatusNet.prototype.getRequestToken = function(callback) {
    var statusnet = this,
        oa = statusnet.getOAuth();

    async.waterfall([
        function(callback) {
            oa.getOAuthRequestToken(callback);
        },
        function(token, secret, other, callback) {
            RequestToken.create({token: token,
                                 secret: secret,
                                 hostname: statusnet.hostname},
                                callback);
        }
    ], callback);
};

StatusNet.prototype.authorizeURL = function(rt, callback) {
    var statusnet = this,
        separator;

    if (_.contains(statusnet.authorization_endpoint, "?")) {
        separator = "&";
    } else {
        separator = "?";
    }
    
    return statusnet.authorization_endpoint + separator + "oauth_token=" + rt.token;
};

StatusNet.prototype.getAccessToken = function(rt, verifier, callback) {
    var statusnet = this,
        oa = statusnet.getOAuth();

    oa.getOAuthAccessToken(rt.token, rt.secret, verifier, callback);
};

StatusNet.prototype.whoami = function(token, secret, callback) {
    var statusnet = this,
        oa = statusnet.getOAuth();

    // XXX: ssl

    async.waterfall([
        function(callback) {
            oa.get(statusnet.whoami_endpoint, token, secret, callback);
        }
    ], function(err, doc, response) {
        var obj;
        if (err) {
            callback(err, null);
        } else {
            try {
                obj = JSON.parse(doc);
                callback(null, obj);
            } catch(e) {
                callback(e, null);
            }
        }
    });
};

StatusNet.prototype.getOAuth = function() {

    var statusnet = this;

    return new OAuth(statusnet.request_token_endpoint,
                     statusnet.access_token_endpoint,
                     statusnet.client_id,
                     statusnet.client_secret,
                     "1.0",
                     Pump2Status.url("/authorized/statusnet/"+statusnet.hostname),
                     "HMAC-SHA1",
                     null, // nonce size; use default
                     {"User-Agent": "pump2status.com/0.1.0"});
};

// Map of hostname => {client_id: ..., client_secret: ...}

StatusNet.credentials = {
};

module.exports = StatusNet;
