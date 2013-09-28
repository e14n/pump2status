// statusnet.js
//
// data object representing a remote StatusNet host
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

var _ = require("underscore"),
    wf = require("webfinger"),
    async = require("async"),
    qs = require("querystring"),
    http = require("http"),
    https = require("https"),
    urlfmt = require("url").format,
    urlparse = require("url").parse,
    OAuth = require("oauth").OAuth,
    PumpIOClientApp = require("pump.io-client-app"),
    DatabankObject = require("databank").DatabankObject,
    RequestToken = PumpIOClientApp.RequestToken;

var StatusNet = DatabankObject.subClass("statusnet");

StatusNet.schema = {
    pkey: "hostname",
    fields: ["client_id",
             "client_secret",
             "request_token_endpoint",
             "access_token_endpoint",
             "authorization_endpoint",
             "whoami_endpoint",
             "created",
             "updated"]
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

    // OAuth credentials

    if (_.has(StatusNet.credentials, hostname)) {
        _.extend(props, StatusNet.credentials[hostname]);
    } else {
        _.extend(props, {
            client_id: "anonymous",
            client_secret: "anonymous"
        });
    }

    async.waterfall([
        // We need to know whether to use HTTPS or HTTP. HEAD the config endpoint with both versions.
        function(callback) {
            async.detectSeries(['https:', 'http:'],
                               function(proto, callback) {
                                   var url = urlfmt({protocol: proto,
                                                     hostname: hostname,
                                                     path: "/api/statusnet/config.json"}),
                                       mod = (proto == 'https:') ? https : http;
                                   
                                   mod.request(url, function(resp) {
                                       if (resp.statusCode >= 200 && resp.statusCode < 300) {
                                           callback(true);
                                       } else {
                                           callback(false);
                                       }
                                   }).on('error', function(err) {
                                       callback(false);
                                   }).end();
                               },
                               function(proto) {
                                   if (proto) {
                                       callback(null, proto);
                                   } else {
                                       callback(new Error("Can't retrieve config endpoint"), null);
                                   }
                               });
        },
        function(proto, callback) {
            _.extend(props, {
                request_token_endpoint: proto+"//"+hostname+"/api/oauth/request_token",
                access_token_endpoint: proto+"//"+hostname+"/api/oauth/access_token",
                authorization_endpoint: proto+"//"+hostname+"/api/oauth/authorize",
                whoami_endpoint: proto+"//"+hostname+"/api/account/verify_credentials.json"
            });
            StatusNet.create(props, callback);
        }
    ], callback);
};

StatusNet.prototype.getRequestToken = function(site, callback) {
    var statusnet = this,
        oa = statusnet.getOAuth(site);

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

StatusNet.prototype.getAccessToken = function(site, rt, verifier, callback) {
    var statusnet = this,
        oa = statusnet.getOAuth(site);

    oa.getOAuthAccessToken(rt.token, rt.secret, verifier, callback);
};

StatusNet.prototype.whoami = function(site, token, secret, callback) {
    var statusnet = this,
        oa = statusnet.getOAuth(site);

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

StatusNet.prototype.getOAuth = function(site) {

    var statusnet = this;

    return new OAuth(statusnet.request_token_endpoint,
                     statusnet.access_token_endpoint,
                     statusnet.client_id,
                     statusnet.client_secret,
                     "1.0",
                     site.url("/authorized/statusnet/"+statusnet.hostname),
                     "HMAC-SHA1",
                     null, // nonce size; use default
                     {"User-Agent": site.userAgent()});
};

// Map of hostname => {client_id: ..., client_secret: ...}

StatusNet.credentials = {
};

module.exports = StatusNet;
