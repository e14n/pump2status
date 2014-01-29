# app.coffee
#
# pump2status entrypoint
#
# Copyright 2013-2014 E14N (https://e14n.com/)
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
 
fs = require 'fs'
path = require 'path'

async = require 'async'
_ = require 'underscore'

databank = require 'databank'
Databank = databank.Databank
DatabankObject = databank.DatabankObject
PumpIOClientApp = require 'pump.io-client-app'

routes = require './routes'
Shadow = require './shadow'
Edge = require './edge'
Updater = require './updater'
Forwarder = require './forwarder'

config = undefined

defaults =
  name: 'Pump2Status'
  description: 'Find your StatusNet friends on pump.io.'
  forwardInterval: 15 * 60 * 1000
  updateInterval: 12 * 60 * 60 * 1000
  params: {}
  views: path.join(__dirname, 'views')
  static: path.join(__dirname, 'public')
  foreign: 'statusnet'
  foreignName: null

ForeignUser = undefined
ForeignHost = undefined

if fs.existsSync('/etc/pump2status.json')
  config = _.defaults(JSON.parse(fs.readFileSync('/etc/pump2status.json')), defaults)
else
  config = defaults
  
config.foreignName = config.foreign.substring(0, 1).toUpperCase() + config.foreign.substring(1)  unless config.foreignName
config.params.schema = {}  unless config.params.schema

ForeignHost = require("./#{config.foreign}")(config)
ForeignUser = require("./#{config.foreign}user")(config, ForeignHost)

# Now, our stuff
_.each [ForeignUser, ForeignHost, Shadow, Edge], (Cls) ->
  # some foreign classes may not need a schema
  config.params.schema[Cls.type] = Cls.schema if Cls.schema
  return

# sets up the config
app = new PumpIOClientApp(config)

# Attach shadows to the user
 
oldAfterGet = PumpIOClientApp.User.prototype.afterGet

PumpIOClientApp.User.prototype.afterGet = (callback) ->
  user = this
  app.log.debug {user: user.id}, "Getting shadows"
  async.waterfall [
    (callback) ->
      # Call the default hook first
      oldAfterGet.call user, callback
    (callback) ->
      Shadow.search {pumpio: user.id}, callback
    (shadows, callback) ->
      ForeignUser.readArray _.pluck(shadows, 'statusnet'), callback
  ], (err, statusnetusers) ->
    if err
      callback err
    else
      user.shadows = statusnetusers
      app.log.debug {shadows: _.pluck(user.shadows, "id")}, "Got shadows"
      callback null

# Our params
app.param 'fuid', (req, res, next, fuid) ->
  ForeignUser.get fuid, (err, fuser) ->
    if err
      next err
    else
      req.fuser = fuser
      next()
    return

  return

routes.addRoutes app,
  foreign: config.foreign
  ForeignUser: ForeignUser
  ForeignHost: ForeignHost

# Any per-network routes
foreignRoutes = require "./#{config.foreign}routes"

foreignRoutes.addRoutes app,
  foreign: config.foreign
  ForeignUser: ForeignUser
  ForeignHost: ForeignHost

# updater -- keeps the world up-to-date
# XXX: move to master process when clustering

app.log.debug 'Initializing updater'

app.updater = new Updater(
  log: app.log
  site: app.site
  interval: config.updateInterval
  ForeignUser: ForeignUser
  ForeignHost: ForeignHost
)

app.forwarder = new Forwarder(
  log: app.log
  site: app.site
  interval: config.forwardInterval
  ForeignUser: ForeignUser
  ForeignHost: ForeignHost
)

# Start the app
app.log.debug
  port: config.port
  address: config.address
, 'Starting app listener'

app.run (err) ->
  if err
    app.log.error err
  else
    console.log 'Express server listening on address %s port %d', config.address, config.port
    app.updater.start()
    app.forwarder.start()
  return
