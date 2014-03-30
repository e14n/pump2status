# facebookuser.js
#
# data object representing a Facebook user
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

urlparse = require("url").parse
require "set-immediate"

_ = require "underscore"
async = require "async"
validator = require "validator"
sanitize = validator.sanitize
DatabankObject = require("databank").DatabankObject
PumpIOClientApp = require "pump.io-client-app"
User = PumpIOClientApp.User

Facebook = require("./facebook")
Shadow = require("./shadow")
Edge = require("./edge")
LinkError = require("./linkerror")

module.exports = (config, Facebook) ->
  
  FacebookUser = DatabankObject.subClass("facebookuser")
  hostname = "facebook.com"
  
  FacebookUser.schema =
    facebookuser:
      pkey: "id"
      fields: [
        "screen_name"
        "id_str"
        "name"
        "avatar"
        "token"
        "secret"
        "autopost"
        "created"
        "updated"
      ]

  FacebookUser.id = (person) ->
    if person.id_str and person.id_str.length > 0
      person.id_str + "@" + hostname
    else
      null

  FacebookUser.fromUser = (person, token, secret, callback) ->
    fu = new FacebookUser()
    fu.id = FacebookUser.id(person)
    unless fu.id
      callback new Error("No id"), null
      return
    fu.screen_name = person.screen_name
    fu.id_str = person.id_str
    fu.name = person.name
    fu.avatar = person.profile_image_url
    fu.token = token
    fu.secret = secret
    fu.autopost = false
    fu.save callback
    return

  FacebookUser.getHostname = (id) ->
    hostname

  FacebookUser::getHost = (callback) ->
    Facebook

  FacebookUser::getUser = (callback) ->
    fu = this
    async.waterfall [
      (callback) ->
        Shadow.get fu.id, callback
      (shadow, callback) ->
        User.get shadow.pumpio, callback
    ], callback
    return

  FacebookUser::beFound = (callback) ->
    fu = this
    user = undefined
    ensureFollows = (waiter, user, callback) ->
      Edge.get Edge.key(waiter.id, user.id), (err, edge) ->
        if err and err.name is "NoSuchThingError"
          waiter.postActivity
            verb: "follow"
            object:
              objectType: "person"
              id: user.id
          , (err, activity) ->
            if err
              
              # XXX: log this
              callback null
            else
              Edge.create
                from: waiter.id
                to: user.id
              , callback
            return

        else if err
          
          # XXX: log this
          callback null
        else
          callback null
        return

      return

    async.waterfall [
      (callback) ->
        fu.getUser callback
      (results, callback) ->
        user = results
        Edge.search {to: fu.id}, callback
      (edges, callback) ->
        # Find pump.io IDs of originators of these edges waiting for this user to join
        waiters = _.pluck edges, "from"
        Shadow.readArray waiters, callback
      (shadows, callback) ->
        ids = _.pluck shadows, "pumpio"
        if not ids or ids.length is 0
          callback null
        else
          # For each shadow, have it follow the pump.io account
          async.forEachLimit ids, 25, ((id, callback) ->
            async.waterfall [
              (callback) ->
                User.get id, callback
              (waiter, callback) ->
                ensureFollows waiter, user, callback
            ], callback
            return
          ), callback
    ], callback
    return

  FacebookUser::updateFollowing = (site, callback) ->
    
    fu = this
    
    addEdge = (id, callback) ->
      Edge.create {from: fu.id, to: id}, callback

    deleteEdge = (id, callback) ->
      bank = Edge.bank()
      bank.del Edge.type, Edge.key(fu.id, id), callback

    async.waterfall [
      (callback) ->
        async.parallel [
          (callback) ->
            following = "https://api.facebook.com/1.1/friends/ids.json?cursor=-1&user_id=" + fu.id_str
            oa = Facebook.getOAuth(site)
            
            # Get the current following list (up to 5000!) from Facebook
            # XXX: Handle users following more than 5000 others
            oa.get following, fu.token, fu.secret, (err, doc, resp) ->
              results = undefined
              if err and err.statusCode is 401
                callback new LinkError(tu, err)
              else if err
                callback err
              else
                try
                  results = JSON.parse(doc)
                catch e
                  callback e, null
                if _.isObject(results) and _.isArray(results.ids)
                  callback null, results.ids
                else
                  callback new Error("Unexpected results from Facebook: " + doc), null
              return

          (callback) ->
            
            # Get the edges we know about from the database
            Edge.search
              from: fu.id
            , callback
        ], callback
      (results, callback) ->
        ids = results[0]
        edges = results[1]
        known = _.pluck(edges, "to")
        current = _.map(ids, (id) ->
          id + "@facebook.com"
        )
        toAdd = _.difference(current, known)
        toDel = _.difference(known, current)
        
        # XXX: autofollow
        async.parallel [
          (callback) ->
            
            # Add new ones we haven't seen before
            async.eachLimit toAdd, 16, addEdge, callback
          (callback) ->
            
            # Remove old ones that are no longer current
            async.eachLimit toDel, 16, deleteEdge, callback
        ], callback
    ], (err) ->
      callback err
      return

    return

  
  # XXX: get already-following info
  FacebookUser::findFriends = (callback) ->
    fu = this
    user = undefined
    async.waterfall [
      
      # Get the user
      (callback) ->
        fu.getUser callback
      
      # Find outgoing edges from this user
      (results, callback) ->
        user = results
        Edge.search
          from: fu.id
        , callback
      
      # Find pump.io IDs of originators of these edges waiting for this user to join
      (edges, callback) ->
        snFriends = _.pluck(edges, "to")
        Shadow.readArray snFriends, callback
      (shadows, callback) ->
        ids = _.filter(_.uniq(_.pluck(_.compact(shadows), "pumpio")), (id) ->
          id isnt user.id
        )
        
        # For each shadow, get its User
        User.readArray ids, callback
    ], callback
    return

  FacebookUser::associate = (user, callback) ->
    fu = this
    Shadow.create
      facebook: fu.id
      pumpio: user.id
    , callback
    return

  FacebookUser::getNickname = (callback) ->
    tuser = this
    parts = undefined
    setImmediate ->
      callback null, tuser.screen_name
      return

    return

  FacebookUser::forwardActivity = (activity, site, callback) ->
    twuser = this
    isPublicActivity = (act) ->
      recip = []
      _.each [
        "to"
        "cc"
        "bto"
        "bcc"
      ], (prop) ->
        recip = recip.concat(act[prop])  if _.isArray(act[prop])
        return

      _.some recip, (rec) ->
        rec.objectType is "collection" and rec.id is "http://activityschema.org/collection/public"


    isPostNoteActivity = (act) ->
      act.verb is "post" and act.object.objectType is "note"

    if isPublicActivity(activity) and isPostNoteActivity(activity)
      twuser.postActivity activity, site, callback
    else
      callback null
    return

  
  # XXX: forward non-public stuff to followers iff user has a private account
  # XXX: forward public images
  FacebookUser::postActivity = (activity, site, callback) ->
    fu = this
    oa = Facebook.getOAuth(site)
    url = "https://api.facebook.com/1.1/statuses/update.json"
    stripTags = (str) ->
      str.replace /<(?:.|\n)*?>/g, ""

    toStatus = (activity) ->
      content = activity.object.content
      link = activity.object.url
      base = stripTags(sanitize(content).entityDecode())
      status = undefined
      if base.length <= 140
        status = base
      else
        status = base.substr(0, 140 - (link.length + 2)) + "… " + link
      status

    params = status: toStatus(activity)
    oa.post url, fu.token, fu.secret, params, (err, doc, resp) ->
      if err and err.statusCode is 401
        callback new LinkError(tu, err)
      else
        callback err
      return

    return

  FacebookUser::visibleId = ->
    "@" + @screen_name

  FacebookUser::afterDel = (callback) ->
    fuser = this
    delShadow = (shadow, callback) ->
      shadow.del callback
      return

    Shadow.search
      statusnet: fuser.id
    , (err, shadows) ->
      if err
        callback err
      else
        async.each shadows, delShadow, callback
      return

    return

  FacebookUser
