# facebook.js
#
# data object representing facebook.com
#
# Copyright 2013, E14N (https://e14n.com/)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
_ = require("underscore")
async = require("async")
OAuth = require("oauth").OAuth
PumpIOClientApp = require("pump.io-client-app")
DatabankObject = require("databank").DatabankObject
RequestToken = PumpIOClientApp.RequestToken

module.exports = (config) ->
  client_id = config.client_id
  client_secret = config.client_secret
  hostname = "facebook.com"
  Facebook =
    getRequestToken: (site, callback) ->
      oa = Facebook.getOAuth(site)
      async.waterfall [
        (callback) ->
          oa.getOAuthRequestToken callback
        (token, secret, other, callback) ->
          RequestToken.create
            token: token
            secret: secret
            hostname: hostname
          , callback
      ], callback
      return

    authorizeURL: (site) ->
      redirect_uri = site.url "/authorized-for-facebook"
      "https://www.facebook.com/dialog/oauth?client_id=#{client_id}&redirect_uri=#{redirect_uri}"

    getAccessToken: (site, rt, verifier, callback) ->
      oa = Facebook.getOAuth(site)
      oa.getOAuthAccessToken rt.token, rt.secret, verifier, callback
      return

    whoami: (site, token, secret, callback) ->
      oa = Facebook.getOAuth(site)
      async.waterfall [(callback) ->
        oa.get whoami_endpoint, token, secret, callback
        return
      ], (err, doc, response) ->
        obj = undefined
        if err
          callback err, null
        else
          try
            obj = JSON.parse(doc)
            callback null, obj
          catch e
            callback e, null
        return

      return

    getOAuth: (site) ->
      new OAuth(request_token_endpoint,
                access_token_endpoint,
                client_id,
                client_secret,
                "1.0",
                site.url("/authorized-for-facebook"),
                "HMAC-SHA1",
                null, # nonce size; use default
                {"User-Agent": site.userAgent()}
        )

  Facebook
