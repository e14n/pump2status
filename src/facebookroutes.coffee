# facebookroutes.js
#
# Routes for Facebook authorization
#
# Copyright 2014, E14N (https://e14n.com/)
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

async = require("async")
_ = require("underscore")
PumpIOClientApp = require("pump.io-client-app")
RequestToken = PumpIOClientApp.RequestToken
userAuth = PumpIOClientApp.userAuth
userOptional = PumpIOClientApp.userOptional
userRequired = PumpIOClientApp.userRequired
noUser = PumpIOClientApp.noUser

Shadow = require("./shadow")

addRoutes = (app, options) ->
  
  foreign = options.foreign
  
  FacebookUser = options.ForeignUser
  Facebook = options.ForeignHost
  
  addAccount = (req, res, next) ->
    site = req.site
    res.redirect Facebook.authorizeURL(req.site)

  authorizedForFacebook = (req, res, next) ->

    if req.query.error
      next new Error "Error authenticating"
      return

    req.log.info req.query, "Facebook results"

    if !req.query.code
      next new Error "No 'code' parameter returned"
      return
      
    async.waterfall [
      (callback) ->
        Facebook.getAccessToken req.site, req.query.code, callback
      (accessToken, expiry, callback) ->
        Facebook.whoami req.site, access_token, token_secret, callback
        ], callback
      (results, callback) ->
        object = results[1]
        FacebookUser.fromUser object, access_token, token_secret, callback
      (results, callback) ->
        fuser = results
        Shadow.get fuser.id, (err, shadow) ->
          if err and err.name is "NoSuchThingError"
            Shadow.create
              statusnet: fuser.id
              pumpio: user.id
            , callback
          else if err
            callback err, null
          else unless shadow.pumpio is user.id
            callback new Error(fuser.id + " is already linked to user " + shadow.pumpio), null
          else
            callback null, shadow
          return

      (shadow, callback) ->
        fuser.beFound callback
      (callback) ->
        fuser.updateFollowing req.site, callback
    ], (err) ->
      if err
        next err
      else
        res.redirect "/find-friends/" + fuser.id
      return

    return
  
  # Routes
  app.log.debug "Initializing Facebook routes"
  app.get "/add-account", userAuth, userRequired, addAccount
  app.get "/authorized-for-facebook", userAuth, userRequired, authorizedForFacebook
  return

exports.addRoutes = addRoutes
