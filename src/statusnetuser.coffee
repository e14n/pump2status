# statusnetuser.js
#
# data object representing an statusnetuser
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
urlparse = require("url").parse
DatabankObject = require("databank").DatabankObject
Shadow = require("./shadow")
Edge = require("./edge")
AtomActivity = require("./atomactivity")
PumpIOClientApp = require("pump.io-client-app")
User = PumpIOClientApp.User
module.exports = (config, StatusNet) ->
  StatusNetUser = DatabankObject.subClass("statusnetuser")
  StatusNetUser.schema = statusnetuser:
    pkey: "id"
    fields: [
      "name"
      "hostname"
      "avatar"
      "token"
      "secret"
      "friends"
      "autopost"
      "created"
      "updated"
    ]

  StatusNetUser.hostname = (person) ->
    parts = undefined
    return null  unless _.isString(person.statusnet_profile_url)
    parts = urlparse(person.statusnet_profile_url)
    if parts and parts.hostname
      parts.hostname
    else
      null

  StatusNetUser.id = (person) ->
    hostname = StatusNetUser.hostname(person)
    if hostname and person.screen_name and person.screen_name.length > 0
      person.screen_name + "@" + hostname
    else
      null

  StatusNetUser.fromUser = (person, token, secret, callback) ->
    snu = new StatusNetUser()
    snu.hostname = StatusNetUser.hostname(person)
    unless snu.hostname
      callback new Error("No hostname"), null
      return
    snu.id = StatusNetUser.id(person)
    unless snu.id
      callback new Error("No id"), null
      return
    snu.name = person.name
    snu.avatar = person.profile_image_url
    snu.token = token
    snu.secret = secret
    
    # XXX: SSL?
    # XXX: index.php/ prefix?
    snu.following = "http://" + snu.hostname + "/api/statuses/friends/" + person.screen_name + ".json"
    snu.save callback
    return

  StatusNetUser.getHostname = (id) ->
    parts = id.split("@")
    hostname = parts[1].toLowerCase()
    hostname

  StatusNetUser::getHost = (callback) ->
    snu = this
    StatusNet.get snu.hostname, callback
    return

  StatusNetUser::getUser = (callback) ->
    snu = this
    async.waterfall [
      (callback) ->
        Shadow.get snu.id, callback
      (shadow, callback) ->
        User.get shadow.pumpio, callback
    ], callback
    return

  StatusNetUser::beFound = (callback) ->
    snu = this
    user = undefined
    async.waterfall [
      (callback) ->
        snu.getUser callback
      (results, callback) ->
        user = results
        Edge.search
          to: snu.id
        , callback
      
      # Find pump.io IDs of originators of these edges waiting for this user to join
      (edges, callback) ->
        waiters = _.pluck(edges, "from")
        Shadow.readArray waiters, callback
      (shadows, callback) ->
        ids = _.pluck(shadows, "pumpio")
        if not ids or ids.length is 0
          callback null
        else
          
          # For each shadow, have it follow the pump.io account
          async.forEachLimit ids, 25, ((id, callback) ->
            async.waterfall [
              (callback) ->
                User.get id, callback
              (waiter, callback) ->
                waiter.postActivity
                  verb: "follow"
                  object:
                    objectType: "person"
                    id: user.id
                , callback
            ], callback
            return
          ), callback
    ], callback
    return

  StatusNetUser::updateFollowing = (site, callback) ->
    snu = this
    sn = undefined
    oa = undefined
    addEdge = (id, callback) ->
      edge = new Edge(
        from: snu.id
        to: id
      )
      edge.save callback
      return

    q = async.queue(addEdge, 25)
    async.waterfall [
      (callback) ->
        snu.getHost callback
      (results, callback) ->
        getPage = (i, callback) ->
          async.waterfall [
            (callback) ->
              oa.get snu.following + "?page=" + i, snu.token, snu.secret, callback
            (doc, resp, callback) ->
              following = undefined
              ids = undefined
              try
                following = JSON.parse(doc)
              catch e
                callback e
                return
              
              # Get valid-looking IDs
              ids = _.compact(_.map(following, (person) ->
                StatusNetUser.id person
              ))
              q.push ids
              callback null, following.length
          ], (err, len) ->
            if err
              callback err
            else if len < 100
              callback null
            else
              getPage i + 1, callback
            return

          return

        sn = results
        oa = sn.getOAuth(site)
        getPage 1, callback
    ], callback
    return

  
  # XXX: get already-following info
  StatusNetUser::findFriends = (callback) ->
    snu = this
    user = undefined
    async.waterfall [
      
      # Get the user
      (callback) ->
        snu.getUser callback
      
      # Find outgoing edges from this user
      (results, callback) ->
        user = results
        Edge.search
          from: snu.id
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

  StatusNetUser::associate = (user, callback) ->
    snu = this
    Shadow.create
      statusnet: snu.id
      pumpio: user.id
    , callback
    return

  StatusNetUser::getNickname = (callback) ->
    snuser = this
    parts = undefined
    unless _.isString(snuser.id)
      null
    else
      parts = snuser.id.split("@")
      parts[0]

  StatusNetUser::forwardActivity = (activity, site, callback) ->
    snuser = this
    isPublicPostNoteActivity = (act) ->
      recip = []
      _.each [
        "to"
        "cc"
        "bto"
        "bcc"
      ], (prop) ->
        recip = recip.concat(act[prop])  if _.isArray(act[prop])
        return

      act.verb is "post" and act.object.objectType is "note" and _.some(recip, (rec) ->
        rec.objectType is "collection" and rec.id is "http://activityschema.org/collection/public"
      )

    if isPublicPostNoteActivity(activity)
      snuser.postActivity activity, site, callback
    else
      callback null
    return

  StatusNetUser::postActivity = (activity, site, callback) ->
    snu = this
    async.waterfall [
      (callback) ->
        snu.getHost callback
      (sn, callback) ->
        oa = sn.getOAuth(site)
        nickname = snu.getNickname()
        entry = new AtomActivity(activity)
        url = "http://" + snu.hostname + "/api/statuses/user_timeline/" + nickname + ".atom"
        oa.post url, snu.token, snu.secret, entry.toString(), "application/atom+xml", callback
    ], (err, body, response) ->
      callback err
      return

    return

  StatusNetUser::visibleId = ->
    @id

  StatusNetUser::afterDel = (callback) ->
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

  StatusNetUser
