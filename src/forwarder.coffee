# forwarder.js
#
# Forwards the state of the world
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
PumpIOClientApp = require("pump.io-client-app")
User = PumpIOClientApp.User
Host = PumpIOClientApp.Host
Shadow = require("./shadow")
Edge = require("./edge")
LinkError = require("./linkerror")

UnavailableFeedError = (url, wrapped) ->
  Error.captureStackTrace this, UnavailableFeedError
  @url = url
  @wrapped = wrapped
  return

UnavailableFeedError:: = new Error()
UnavailableFeedError::constructor = UnavailableFeedError
Forwarder = (options) ->
  log = options.log.child(component: "forwarder")
  site = options.site
  ForeignUser = options.ForeignUser
  ForeignHost = options.ForeignHost
  forwardAll = ->
    cnt = 0
    log.debug "Start queueing users"
    User.scan ((user) ->
      cnt++
      q.push user, (err) ->
        if err
          log.error
            err: err
            user: user.id
          , "Error forwarding activities"
          if err instanceof UnavailableFeedError
            removeUser user, (err) ->
              if err
                log.error
                  err: err
                  user: user.id
                , "Error deleting user after failed feed"
              else
                log.info
                  user: user.id
                , "Deleted user after failed feed"
              return

        else
          log.debug
            user: user.id
          , "Done forwarding"
        return

      return
    ), (err) ->
      if err
        log.error
          err: err
        , "Error queueing users."
      else
        log.debug
          userCount: cnt
        , "Done queueing users"
      return

    return

  forwardActivities = (user, callback) ->
    a = 0
    getAutos = (callback) ->
      async.waterfall [
        (callback) ->
          Shadow.search
            pumpio: user.id
          , callback
        (shadows, callback) ->
          ids = _.pluck(shadows, "statusnet")
          ForeignUser.readArray ids, callback
        (snus, callback) ->
          autos = _.filter(snus, (snu) ->
            snu.autopost
          )
          callback null, autos
      ], callback
      return

    getNewActivities = (callback) ->
      items = null
      async.waterfall [
        (callback) ->
          user.getHost callback
        (host, callback) ->
          oa = host.getOAuth()
          url = undefined
          
          # XXX: just use client auth?
          if user.lastseen
            url = user.outbox + "?since=" + user.lastseen
          else
            url = user.outbox
          oa.get url, user.token, user.secret, (err, data, response) ->
            if err
              if err.statusCode is 404
                callback new UnavailableFeedError(url, err), null
              else
                callback err, null
            else
              callback null, data, response
            return

        (data, response, callback) ->
          feed = undefined
          if response.statusCode >= 400 and response.statusCode < 600
            callback new Error("Error " + response.statusCode + ": " + data)
          else if not response.headers or not response.headers["content-type"] or response.headers["content-type"].substr(0, "application/json".length) isnt "application/json"
            callback new Error("Not application/json")
          else
            try
              feed = JSON.parse(data)
              callback null, feed
            catch e
              callback e, null
        (feed, callback) ->
          items = feed.items
          if items and items.length > 0
            user.lastseen = items[0].id
            user.save callback
          else
            callback null, null
      ], (err) ->
        if err
          callback err, null
        else
          callback null, items
        return

      return

    autos = undefined
    ppnas = undefined
    async.waterfall [
      (callback) ->
        getAutos callback
      (results, callback) ->
        autos = results
        if _.isArray(autos) and autos.length > 0
          log.debug
            autos: _.pluck(autos, "id")
            user: user.id
          , "Accounts updating automatically."
          getNewActivities callback
        else
          
          # We can skip costly requests if we're not forwarding the activities
          log.debug
            user: user.id
          , "No autos; skipping polling."
          callback null, []
      (results, callback) ->
        ppnas = results
        log.debug
          ppnas: ppnas.length
          user: user.id
        , "Activities to forward."
        async.each ppnas, ((ppna, callback) ->
          async.each autos, (auto, callback) ->
            log.info
              ppna: ppna.id
              auto: auto.id
              user: user.id
            , "Forwarding activity for user."
            auto.forwardActivity ppna, site, (err) ->
              if err
                log.error
                  user: user.id
                  fuser: auto.id
                  activity: ppna.id
                  err: err

                if err instanceof LinkError
                  log.info
                    user: user.id
                    fuser: auto.id
                  , "Removing disconnected user"
                  auto.del (err) ->
                    if err
                      log.error
                        user: user.id
                        fuser: auto.id
                        err: err
                      , "Error removing disconnected foreign user"
                    else
                      log.info
                        user: user.id
                        fuser: auto.id
                      , "Removed disconnected user"
                    return

              else
                log.debug
                  user: user.id
                  fuser: auto.id
                  activity: ppna.id
                , "Forwarded"
              
              # Ignore errors
              callback null
              return

            return

          return
        ), callback
    ], callback
    return

  removeUser = (user, callback) ->
    a = 0
    delShadow = (shadow, callback) ->
      log.debug
        shadow: shadow
      , "Deleting shadow"
      shadow.del callback
      return

    delEdge = (edge, callback) ->
      log.debug
        edge: edge
      , "Deleting edge"
      edge.del callback
      return

    async.parallel [
      (callback) ->
        Shadow.search
          pumpio: user.id
        , (err, shadows) ->
          if err
            callback err
          else
            async.each shadows, delShadow, callback
          return

      (callback) ->
        Edge.search
          from: user.id
        , (err, edges) ->
          if err
            callback err
          else
            async.each edges, delEdge, callback
          return

      (callback) ->
        Edge.search
          to: user.id
        , (err, edges) ->
          if err
            callback err
          else
            async.each edges, delEdge, callback
          return

      (callback) ->
        user.del callback
    ], callback
    return

  q = async.queue(forwardActivities, 25)
  @start = ->
    log.debug "Starting forwarder."
    
    # Do this every 15 minutes
    setInterval forwardAll, options.interval
    
    # Do one at the beginning
    forwardAll()
    return

  return

module.exports = Forwarder
