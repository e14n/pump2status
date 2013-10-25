// twitter.js
//
// data object representing twitter.com
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
    async = require("async"),
    OAuth = require("oauth").OAuth,
    PumpIOClientApp = require("pump.io-client-app"),
    DatabankObject = require("databank").DatabankObject,
    RequestToken = PumpIOClientApp.RequestToken;

module.exports = function(config) {

    var client_id = config.client_id,
        client_secret = config.client_secret,
        request_token_endpoint = "https://api.twitter.com/oauth/request_token",
        access_token_endpoint = "https://api.twitter.com/oauth/access_token",
        authorization_endpoint = "https://api.twitter.com/oauth/authorize",
        whoami_endpoint = "https://api.twitter.com/1.1/account/verify_credentials.json",
        hostname = "twitter.com",
        Twitter = {
            getRequestToken: function(site, callback) {
                var oa = Twitter.getOAuth(site);

                async.waterfall([
                    function(callback) {
                        oa.getOAuthRequestToken(callback);
                    },
                    function(token, secret, other, callback) {
                        RequestToken.create({token: token,
                                             secret: secret,
                                             hostname: hostname},
                                            callback);
                    }
                ], callback);
            },
            authorizeURL: function(rt, callback) {
                var separator;

                if (_.contains(authorization_endpoint, "?")) {
                    separator = "&";
                } else {
                    separator = "?";
                }
                
                return authorization_endpoint + separator + "oauth_token=" + rt.token;
            },
            getAccessToken: function(site, rt, verifier, callback) {
                var oa = Twitter.getOAuth(site);

                oa.getOAuthAccessToken(rt.token, rt.secret, verifier, callback);
            },
            whoami: function(site, token, secret, callback) {
                var oa = Twitter.getOAuth(site);

                async.waterfall([
                    function(callback) {
                        oa.get(whoami_endpoint, token, secret, callback);
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
            },
            getOAuth: function(site) {

                return new OAuth(request_token_endpoint,
                                 access_token_endpoint,
                                 client_id,
                                 client_secret,
                                 "1.0",
                                 site.url("/authorized/twitter/"+hostname),
                                 "HMAC-SHA1",
                                 null, // nonce size; use default
                                 {"User-Agent": site.userAgent()});
            }
        };

    return Twitter;
};
