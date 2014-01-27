# atomactivity.js
#
# data object representing an Activity
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
validator = require("validator")
sanitize = validator.sanitize
NS = "http://activitystrea.ms/schema/1.0/"
AtomActivity = (act) ->
  entry = this
  canonicalize = (str) ->
    if str.indexOf(":") is -1
      NS + str
    else
      str

  stripTags = (str) ->
    str.replace /<(?:.|\n)*?>/g, ""

  activityObject = (obj, tag) ->
    str = ""
    str += "<" + tag + ">\n"  if tag
    if tag is "author"
      str += "<uri>" + obj.id + "</uri>\n"
      str += "<name>" + obj.displayName + "</name>\n"
    else
      str += "<id>" + obj.id + "</id>\n"
      str += "<title>" + ((if (obj.displayName) then obj.displayName else "")) + "</title>\n"
    str += "<published>" + obj.published + "</published>\n"  if obj.published
    str += "<updated>" + obj.updated + "</updated>\n"  if obj.updated
    str += "<activity:object-type>" + canonicalize(obj.objectType) + "</activity:object-type>\n"
    str += "<summary>" + stripTags(sanitize(obj.summary).entityDecode()) + "</summary>\n"  if obj.summary
    str += "<content type=\"html\">" + sanitize(obj.content).escape() + "</content>\n"  if obj.content
    str += "<link rel=\"preview\" href=\"" + obj.image.url + "\" />\n"  if obj.image
    str += "<link rel=\"alternate\" type=\"text/html\" href=\"" + obj.url + "\" />\n"  if obj.url
    
    # XXX: stream
    # XXX: fullImage
    str += "</" + tag + ">\n"  if tag
    str

  impliedEntry = ->
    str = ""
    str += "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
    str += "<entry xmlns=\"http://www.w3.org/2005/Atom\" xmlns:activity=\"http://activitystrea.ms/spec/1.0/\">\n"
    
    # Don't do the entry tag
    str += activityObject(act.object, null)
    str += "</entry>"
    str

  fullEntry = (act) ->
    str = ""
    str += "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
    str += "<entry xmlns=\"http://www.w3.org/2005/Atom\" xmlns:activity=\"http://activitystrea.ms/spec/1.0/\">\n"
    str += "<id>" + act.id + "</id>\n"
    str += "<published>" + act.published + "</published>\n"
    str += "<title>" + ((if (act.displayName) then act.displayName else "")) + "</title>\n"
    str += "<activity:verb>" + canonicalize(act.verb) + "</activity:verb>\n"
    str += "<summary>" + stripTags(sanitize(act.summary).entityDecode()) + "</summary>\n"  if act.summary
    str += "<content type=\"html\">" + sanitize(act.content).escape() + "</content>\n"  if act.content
    str += activityObject(act.object, "activity:object")  if act.object
    str += activityObject(act.object, "activity:target")  if act.target
    str += "<link rel=\"preview\" href=\"" + act.image.url + "\" />\n"  if act.image
    str += "<link rel=\"alternate\" type=\"text/html\" href=\"" + act.url + "\" />\n"  if act.url
    str += "</entry>\n"
    str

  entry.toString = ->
    if act.verb is "post"
      impliedEntry()
    else
      fullEntry()

  return

module.exports = AtomActivity
