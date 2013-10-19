// atomactivity.js
//
// data object representing an Activity
//
// Copyright 2013, E14N (https://e14n.com/)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var validator = require("validator"),
    sanitize = validator.sanitize;

var NS = 'http://activitystrea.ms/schema/1.0/';

var AtomActivity = function(act) {

    var entry = this,
        canonicalize = function(str) {
            if (str.indexOf(":") == -1) {
                return NS + str;
            } else {
                return str;
            }
        },
        stripTags = function(str) {
            return str.replace(/<(?:.|\n)*?>/gm, '');
        },
        activityObject = function(obj, tag) {
            var str = '';

            if (tag) {
                str += '<'+tag+'>\n';
            }

            if (tag == 'author') {
                str += '<uri>'+obj.id+'</uri>\n';
                str += '<name>'+obj.displayName+'</name>\n';
            } else {
                str += '<id>'+obj.id+'</id>\n';
                str += '<title>'+((obj.displayName) ? obj.displayName : '')+'</title>\n';
            }

            if (obj.published) {
                str += '<published>'+obj.published+'</published>\n';
            }

            if (obj.updated) {
                str += '<updated>'+obj.updated+'</updated>\n';
            }

            str += '<activity:object-type>'+canonicalize(obj.objectType)+'</activity:object-type>\n';

            if (obj.summary) {
                str += '<summary>'+stripTags(sanitize(obj.summary).entityDecode())+'</summary>\n';
            }

            if (obj.content) {
                str += '<content type="html">'+sanitize(obj.content).escape()+'</content>\n';
            }

            if (obj.image) {
                str += '<link rel="preview" href="'+obj.image.url+'" />\n';
            }

            if (obj.url) {
                str += '<link rel="alternate" type="text/html" href="'+obj.url+'" />\n';
            }

            // XXX: stream
            // XXX: fullImage

            if (tag) {
                str += '</'+tag+'>\n';
            }

            return str;
        },
        impliedEntry = function() {
            var str = '';

            str += '<?xml version="1.0" encoding="utf-8"?>\n';
            str += '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:activity="http://activitystrea.ms/spec/1.0/">\n';

            // Don't do the entry tag

            str += activityObject(act.object, null);

            str += '</entry>';

            return str;
        },
        fullEntry = function(act) {
            var str = '';

            str += '<?xml version="1.0" encoding="utf-8"?>\n';
            str += '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:activity="http://activitystrea.ms/spec/1.0/">\n';

            str += '<id>'+act.id+'</id>\n';

            str += '<published>'+act.published+'</published>\n';

            str += '<title>'+((act.displayName) ? act.displayName : '')+'</title>\n';

            str += '<activity:verb>'+canonicalize(act.verb)+'</activity:verb>\n';

            if (act.summary) {
                str += '<summary>'+stripTags(sanitize(act.summary).entityDecode())+'</summary>\n';
            }

            if (act.content) {
                str += '<content type="html">'+sanitize(act.content).escape()+'</content>\n';
            }

            if (act.object) {
                str += activityObject(act.object, 'activity:object');
            }

            if (act.target) {
                str += activityObject(act.object, 'activity:target');
            }

            if (act.image) {
                str += '<link rel="preview" href="'+act.image.url+'" />\n';
            }

            if (act.url) {
                str += '<link rel="alternate" type="text/html" href="'+act.url+'" />\n';
            }

            str += '</entry>\n';

            return str;
        };

    entry.toString = function() {
        if (act.verb == "post") {
            return impliedEntry();
        } else {
            return fullEntry();
        }
    };
};

module.exports = AtomActivity;
