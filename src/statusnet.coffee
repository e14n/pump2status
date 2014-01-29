# statusnet.coffee
#
# data object representing a remote StatusNet host
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
wf = require("webfinger")
async = require("async")
qs = require("querystring")
http = require("http")
https = require("https")
urlfmt = require("url").format
urlparse = require("url").parse
OAuth = require("oauth").OAuth
PumpIOClientApp = require("pump.io-client-app")
DatabankObject = require("databank").DatabankObject
RequestToken = PumpIOClientApp.RequestToken
module.exports = (config) ->
  StatusNet = DatabankObject.subClass("statusnet")
  StatusNet.schema =
    pkey: "hostname"
    fields: [
      "client_id"
      "client_secret"
      "request_token_endpoint"
      "access_token_endpoint"
      "authorization_endpoint"
      "whoami_endpoint"
      "created"
      "updated"
    ]

  StatusNet.ensureStatusNet = (hostname, callback) ->
    StatusNet.get hostname, (err, statusnet) ->
      if err and err.name is "NoSuchThingError"
        StatusNet.discover hostname, callback
      else if err
        callback err, null
      else
        
        # XXX: update endpoints?
        callback null, statusnet
      return

    return

  StatusNet.discover = (hostname, callback) ->
    props = hostname: hostname
    
    # OAuth credentials
    if _.has(StatusNet.credentials, hostname)
      _.extend props, StatusNet.credentials[hostname]
    else
      _.extend props,
        client_id: "anonymous"
        client_secret: "anonymous"

    async.waterfall [
      
      # We need to know whether to use HTTPS or HTTP. HEAD the config endpoint with both versions.
      (callback) ->
        async.detectSeries [
          "https:"
          "http:"
        ], ((proto, callback) ->
          url = urlfmt(
            protocol: proto
            hostname: hostname
            path: "/api/statusnet/config.json"
          )
          mod = (if (proto is "https:") then https else http)
          mod.request(url, (resp) ->
            if resp.statusCode >= 200 and resp.statusCode < 300
              callback true
            else
              callback false
            return
          ).on("error", (err) ->
            callback false
            return
          ).end()
          return
        ), (proto) ->
          if proto
            callback null, proto
          else
            callback new Error("Can't retrieve config endpoint"), null
          return

      (proto, callback) ->
        _.extend props,
          request_token_endpoint: proto + "//" + hostname + "/api/oauth/request_token"
          access_token_endpoint: proto + "//" + hostname + "/api/oauth/access_token"
          authorization_endpoint: proto + "//" + hostname + "/api/oauth/authorize"
          whoami_endpoint: proto + "//" + hostname + "/api/account/verify_credentials.json"

        StatusNet.create props, callback
    ], callback
    return

  StatusNet::getRequestToken = (site, callback) ->
    statusnet = this
    oa = statusnet.getOAuth(site)
    async.waterfall [
      (callback) ->
        oa.getOAuthRequestToken callback
      (token, secret, other, callback) ->
        RequestToken.create
          token: token
          secret: secret
          hostname: statusnet.hostname
        , callback
    ], callback
    return

  StatusNet::authorizeURL = (rt, callback) ->
    statusnet = this
    separator = undefined
    if _.contains(statusnet.authorization_endpoint, "?")
      separator = "&"
    else
      separator = "?"
    statusnet.authorization_endpoint + separator + "oauth_token=" + rt.token

  StatusNet::getAccessToken = (site, rt, verifier, callback) ->
    statusnet = this
    oa = statusnet.getOAuth(site)
    oa.getOAuthAccessToken rt.token, rt.secret, verifier, callback
    return

  StatusNet::whoami = (site, token, secret, callback) ->
    statusnet = this
    oa = statusnet.getOAuth(site)
    
    # XXX: ssl
    async.waterfall [(callback) ->
      oa.get statusnet.whoami_endpoint, token, secret, callback
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

  StatusNet::getOAuth = (site) ->
    statusnet = this
    new OAuth(statusnet.request_token_endpoint, statusnet.access_token_endpoint, statusnet.client_id, statusnet.client_secret, "1.0", site.url("/authorized/statusnet/" + statusnet.hostname), "HMAC-SHA1", null, # nonce size; use default
      "User-Agent": site.userAgent()
    )

  
  # Map of hostname => {client_id: ..., client_secret: ...}
  StatusNet.credentials = config.credentials
  StatusNet
