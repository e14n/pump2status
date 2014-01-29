# statusnetroutes.coffee
#
# Routes for logging in to a StatusNet account
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
async = require("async")
_ = require("underscore")
Shadow = require("./shadow")
PumpIOClientApp = require("pump.io-client-app")
RequestToken = PumpIOClientApp.RequestToken
userAuth = PumpIOClientApp.userAuth
userOptional = PumpIOClientApp.userOptional
userRequired = PumpIOClientApp.userRequired
noUser = PumpIOClientApp.noUser
addRoutes = (app, options) ->
  foreign = options.foreign
  ForeignUser = options.ForeignUser
  ForeignHost = options.ForeignHost
  addAccount = (req, res) ->
    res.render "add-account",
      title: "Add Account"
      user: req.user

    return

  handleAddAccount = (req, res, next) ->
    id = req.body.webfinger
    hostname = ForeignUser.getHostname(id)
    sn = undefined
    async.waterfall [
      (callback) ->
        ForeignHost.ensureForeignHost hostname, callback
      (results, callback) ->
        sn = results
        sn.getRequestToken req.site, callback
    ], (err, rt) ->
      if err
        if err instanceof Error
          next err
        else next new Error(err.data)  if err.data
      else
        res.redirect sn.authorizeURL(rt)
      return

    return

  authorizedForeignHost = (req, res, next) ->
    hostname = req.params.hostname
    token = req.query.oauth_token
    verifier = req.query.oauth_verifier
    problem = req.query.oauth_problem
    user = req.user
    rt = undefined
    sn = undefined
    fuser = undefined
    access_token = undefined
    token_secret = undefined
    id = undefined
    object = undefined
    newUser = false
    unless token
      next new Error("No token returned.")
      return
    async.waterfall [
      (callback) ->
        async.parallel [
          (callback) ->
            RequestToken.get RequestToken.key(hostname, token), callback
          (callback) ->
            ForeignHost.get hostname, callback
        ], callback
      (results, callback) ->
        rt = results[0]
        sn = results[1]
        sn.getAccessToken req.site, rt, verifier, callback
      (token, secret, extra, callback) ->
        access_token = token
        token_secret = secret
        async.parallel [
          (callback) ->
            rt.del callback
          (callback) ->
            sn.whoami req.site, access_token, token_secret, callback
        ], callback
      (results, callback) ->
        object = results[1]
        ForeignUser.fromUser object, access_token, token_secret, callback
      (results, callback) ->
        fuser = results
        Shadow.create
          statusnet: fuser.id
          pumpio: user.id
        , callback
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
  app.log.debug "Initializing statusnet routes"
  app.get "/add-account", userAuth, userRequired, addAccount
  app.post "/add-account", userAuth, userRequired, handleAddAccount
  app.get "/authorized/" + foreign + "/:hostname", userAuth, userRequired, authorizedForeignHost
  return

exports.addRoutes = addRoutes
