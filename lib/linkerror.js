// lib/linkerror.js
//
// The user has disconnected this link in the other server
//
// Copyright 2014, E14N https://e14n.com/
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

// Create a new object, that prototypally inherits from the Error constructor.  

var LinkError = function(fuser, wrapped) {
    Error.captureStackTrace(this, LinkError);
    this.name = "LinkError";  
    this.user = fuser;
    this.wrapped = wrapped;
    this.message = "Disconnected link with " + fuser.id;
};

LinkError.prototype = new Error();  
LinkError.prototype.constructor = LinkError;

module.exports = LinkError;
