# index.js
#
# Most of the routes in the application
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
Shadow = require("../models/shadow")
PumpIOClientApp = require("pump.io-client-app")
RequestToken = PumpIOClientApp.RequestToken
userAuth = PumpIOClientApp.userAuth
userOptional = PumpIOClientApp.userOptional
userRequired = PumpIOClientApp.userRequired
noUser = PumpIOClientApp.noUser
userIsFuser = (req, res, next) ->
  Shadow.get req.fuser.id, (err, shadow) ->
    if err
      next err
    else unless shadow.pumpio is req.user.id
      next new Error("Must be same user")
    else
      next()
    return

  return

addRoutes = (app, options) ->
  foreign = options.foreign
  ForeignUser = options.ForeignUser
  ForeignHost = options.ForeignHost
  findFriends = (req, res, next) ->
    fuser = req.fuser
    found = undefined
    fuser.findFriends (err, found) ->
      if err
        next err
      else
        if found.length is 0
          res.render "no-friends",
            title: "No Friends Found"
            user: req.user
            fuser: fuser

        else
          res.render "find-friends",
            title: "Find Friends"
            user: req.user
            fuser: fuser
            found: found

      return

    return

  saveFriends = (req, res, next) ->
    user = req.user
    fuser = req.fuser
    body = req.body
    found = undefined
    async.waterfall [
      (callback) ->
        fuser.findFriends callback
      (found, callback) ->
        chosen = _.filter(found, (account) ->
          id = account.id.toLowerCase().replace(/[\.@]/g, "_")
          body[id] is "on"
        )
        async.forEachLimit chosen, 10, ((account, callback) ->
          user.postActivity
            verb: "follow"
            object:
              objectType: "person"
              id: account.id
          , callback
          return
        ), callback
    ], (err) ->
      if err
        next err
      else
        res.redirect "/"
      return

    return

  settings = (req, res) ->
    res.render "settings",
      title: "Settings for " + req.fuser.id
      saved: false
      fuser: req.fuser
      user: req.user

    return

  saveSettings = (req, res, next) ->
    autopost = _.has(req.body, "autopost")
    fuser = req.fuser
    async.waterfall [(callback) ->
      fuser.autopost = autopost
      fuser.save callback
      return
    ], (err, fuser) ->
      if err
        next err
      else
        res.render "settings",
          title: "Settings for " + req.fuser.id
          saved: true
          fuser: req.fuser
          user: req.user

      return

    return

  
  # Routes
  app.log.debug "Initializing default routes"
  app.get "/find-friends/:fuid", userAuth, userRequired, userIsFuser, findFriends
  app.post "/find-friends/:fuid", userAuth, userRequired, userIsFuser, saveFriends
  app.get "/settings/:fuid", userAuth, userRequired, userIsFuser, settings
  app.post "/settings/:fuid", userAuth, userRequired, userIsFuser, saveSettings
  return

exports.addRoutes = addRoutes
