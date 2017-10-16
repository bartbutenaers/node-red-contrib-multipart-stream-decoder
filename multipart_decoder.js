/**
 * Copyright 2017 Bart Butenaers
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var http = require("follow-redirects").http;
    var https = require("follow-redirects").https;
    var urllib = require("url");
    var mustache = require("mustache");
    var autoParse = require('auto-parse'); 

    function MultiPartDecoder(n) {
        RED.nodes.createNode(this,n);
        this.delay   = n.delay;
        this.url     = n.url;
        this.ret     = n.ret || "txt";
        this.maximum = n.maximum;
        this.prevReq = null;
        this.prevRes = null;
        
        var node = this;
                
        if (n.tls) {
            var tlsNode = RED.nodes.getNode(n.tls);
        }
         
        // When a timeout has been specified in the settings file, we should take that into account
        if (RED.settings.httpRequestTimeout) { 
            this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000; 
        }
        else { 
            this.reqTimeout = 120000; 
        }

        var prox, noprox;
        if (process.env.http_proxy != null) { prox = process.env.http_proxy; }
        if (process.env.HTTP_PROXY != null) { prox = process.env.HTTP_PROXY; }
        if (process.env.no_proxy != null) { noprox = process.env.no_proxy.split(","); }
        if (process.env.NO_PROXY != null) { noprox = process.env.NO_PROXY.split(","); }
        
        function handleMsg(msg, boundary, preRequestTimestamp, currentStatus, contentLength) {
            if (node.metric()) {
                // Calculate request time
                var diff = process.hrtime(preRequestTimestamp);
                var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                var metricRequestDurationMillis = ms.toFixed(3);
                node.metric("duration.millis", msg, metricRequestDurationMillis);
                if (res.client && res.client.bytesRead) {
                    node.metric("size.bytes", msg, res.client.bytesRead);
                }
            }
            
            // Convert the payload to the required return type
             msg.payload = Buffer.concat(msg.payload); // bin
             if (node.ret !== "bin") {
                msg.payload = msg.payload.toString('utf8'); // txt
                
                if (node.ret === "obj") {
                    try { msg.payload = JSON.parse(msg.payload); } // obj
                    catch(e) { node.warn("JSON parse error"); }
                }
            }
                        
            // In case of multipart streaming, all End-of-line characters should be removed (both from the
            // end and the start).  Otherwise the data will be considered corrupt.  These characters are 
            // remainings from the boundaries and part headers ...
            if (boundary) {
                var begin = 0;
                var end = msg.payload.length - 1;

                // Trim CR or LF characters at the end of the payload
                for (var i = end; i >= begin; i--) {
                    if (msg.payload[i] !== '\n' && msg.payload[i] !== '\r') {
                        break;
                    }
                    end--;
                }
                
                // Trim optional CR or LF characters at the start of the current body
                for (var i = begin; i <= end; i++) {
                    if (msg.payload[i] !== '\n' && msg.payload[i] !== '\r') {
                        break;
                    }
                    begin++;
                }
                
                msg.payload = msg.payload.slice(begin, end);
                
                if (msg.payload.length == 0) {
                    return;
                }
            }
         
            node.send(msg);

            if (!boundary) {
                node.status({}); 
            }  
            else if ((Date.now() - currentStatus.timestamp) > 1000) {
                // For multipart streaming, the node status is inverted every second (to let user know it is still busy processing)
                if (currentStatus.value === "{}") {
                    // Display another ring when content-length is available or not
                    if (contentLength > 0) {
                        currentStatus.value = {fill:"blue",shape:"dot",text:"Streaming"};
                    }
                    else {
                        currentStatus.value = {fill:"blue",shape:"ring",text:"Streaming"};
                    }
                }
                else {
                    currentStatus.value = "{}";
                }
                node.status(currentStatus.value);
                currentStatus.timestamp = Date.now();
            }
        }

        this.on("input",function(msg) {
            var boundary = "";
            var headerBodySeparator = "";
            var headerSeparator = "";
            var searchString = "";
            var currentStatus = {timestamp:0, value:'{}'}; 
            var preRequestTimestamp = process.hrtime();
            
            node.status({fill:"blue",shape:"dot",text:"requesting"});
                        
            // When no url has been specified in the node config, the 'url' value in the input message will be used
            var url = node.url || msg.url;
            
            // The url can contain Mustache placeholders (triple {{{ ), which should be resolved by the corresponding input message fields.
            if (url && url.indexOf("{{") >= 0) {
                url = mustache.render(node.url,msg);
            }
            
            if (msg.hasOwnProperty("pause") && msg.pause == true) {
                if (node.prevRes) {
                    if (node.prevRes.isPaused() == true) {
                        node.warn("Useless to send msg.pause when the active stream is already paused");   
                    }
                    else {
                        node.prevRes.pause();
                        node.status({fill:"orange",shape:"ring",text:"paused"});
                    }
                }     
                else {
                    node.warn("Useless to send msg.pauze when no stream is active");
                }                        
                
                return;
            }
            
            if (msg.hasOwnProperty("resume") && msg.resume == true) {
                if (node.prevRes) {
                    if (node.prevRes.isPaused() == false) {
                        node.warn("Useless to send msg.resume when the active stream is not paused");   
                    }
                    else {
                        node.prevRes.resume();
                    }
                }     
                else {
                    node.warn("Useless to send msg.resume when no stream is active");
                }                        
                
                return;
            }
                                    
            // If a previous request is still busy (endless) streaming, then stop it (undependent whether msg.stop exists or not)
            if (node.prevReq) {
                node.prevReq.abort();
                node.prevReq = null;
                node.prevRes = null;
            }
            
            if (!url) {
                if (msg.hasOwnProperty("stop") && msg.stop == true) {
                    node.status({fill:"blue",shape:"dot",text:"stopped"});
                }
                else {
                    node.error(RED._("No url specified"),msg);
                }
                return;
            }
            
            // If the protocol is not specified in the url, then the status of the TLS flag will decide which protocol is used
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                if (tlsNode) {
                    url = "https://"+url;
                } else {
                    url = "http://"+url;
                }
            }
            
            var opts = urllib.parse(url);
            opts.method = 'GET';
            opts.headers = {};

            if (msg.headers) {
                for (var v in msg.headers) {
                    if (msg.headers.hasOwnProperty(v)) {
                        var name = v.toLowerCase();
                        opts.headers[name] = msg.headers[v];
                    }
                }
            }
            if (this.credentials && this.credentials.user) {
                opts.auth = this.credentials.user+":"+(this.credentials.password||"");
            }
            var payload = null;

            var urltotest = url;
            var noproxy;
            if (noprox) {
                for (var i in noprox) {
                    if (url.indexOf(noprox[i]) !== -1) { noproxy=true; }
                }
            }
            if (prox && !noproxy) {
                var match = prox.match(/^(http:\/\/)?(.+)?:([0-9]+)?/i);
                if (match) {
                    opts.headers['Host'] = opts.host;
                    var heads = opts.headers;
                    var path = opts.pathname = opts.href;
                    opts = urllib.parse(prox);
                    opts.path = opts.pathname = path;
                    opts.headers = heads;
                    opts.method = method;
                    urltotest = match[0];
                }
                else { node.warn("Bad proxy url: " + process.env.http_proxy); }
            }
            
            if (tlsNode) {
                tlsNode.addTLSOptions(opts);
            }
            
            // Send the http request to the client, which should respond with a http stream
            var req = ((/^https/.test(urltotest))?https:http).request(opts,function(res) {  
                var partHeadersObject = {};
                var contentLength = 0;
                var partCurrent = [];
                var partHeader = [];
                var partBody = [];  
                
                // Force NodeJs to return a Buffer (instead of a string): See https://github.com/nodejs/node/issues/6038
                res.setEncoding(null);
                delete res._readableState.decoder;
              
                msg.statusCode = res.statusCode;
                msg.headers = res.headers;
                msg.responseUrl = res.responseUrl;
                msg.payload = [];
 
                // msg.url = url;   // revert when warning above finally removed
                res.on('data',function(chunk) {
                    var searchIndex = -1;
                
                    if (!boundary) {
                        // -----------------------------------------------------------------------------------------
                        // Automatically check whether multipart streaming is required (at the start of the stream)
                        // -----------------------------------------------------------------------------------------
                        var contentType = this.headers['content-type'];
                        
                        if (!/multipart/.test(contentType)) {
                            node.error("A multipart stream should start with content-type containing 'multipart'",msg);
                            return;                        
                        }
                            
                        // Automatically detect the required boundary (that will be used between parts of the stream)
                        boundary = (contentType.match(/.*;\sboundary=(.*)/) || [null, null])[1];

                        if(!boundary) {
                            node.error("No multipart boundary found",msg);
                            return;
                        }

                        // A boundary needs to start with -- (even if -- is absent in the http header)
                        if (!boundary.startsWith('--')) {
                            boundary = '--' + boundary;
                        }

                        // Every part contains one or more headers and one body (content). 
                        // Headers and body are separated by two EOL (end of line) symbols.
                        // Those EOL symbols can be LF (linefeed \n) or CR (carriage return \r) or CRLF (carriage return linefeed \r\n).
                        // Determine the EOL symbols at the start of the stream.
                        var eolSymbols = (chunk.toString().match(/(?:\r\r|\n\n|\r\n\r\n)/g) || []);
                        
                        if (eolSymbols.indexOf('\r\n\r\n') >= 0) {
                            headerBodySeparator = '\r\n\r\n';
                        }
                        else if (eolSymbols.indexOf('\r\r') >= 0) {
                            headerBodySeparator = '\r\r';
                        }
                        else if (eolSymbols.indexOf('\n\n') >= 0) {
                            headerBodySeparator = '\n\n';
                        }

                        if(!headerBodySeparator) {
                            node.error("No multipart EOL separator could be determined",msg);
                            return;
                        }
                        
                        // The header separator is only one half of the header body separator;
                        headerSeparator = headerBodySeparator.slice(0, headerBodySeparator.length/2);
                        
                        // Store the current request/response only in case streaming is detected, so it could be aborted afterwards
                        node.prevReq = req; 
                        node.prevRes = res;
                        
                        // The boundary should arrive at the start of the stream, so let's start searching for it
                        searchString = boundary;                            
                    }
                    
                    if (!boundary) {
                        node.error("A multipart stream should specify a boundary",msg);
                        return;                        
                    }

                    // -----------------------------------------------------------------------------------------
                    // Stream the data in the new chunk
                    // -----------------------------------------------------------------------------------------
                    var checkOverlap = (searchString == boundary && partBody.length > 0) || (searchString != boundary && partHeader.length > 0);
                    
                    while (true) {   
                        if (searchString == boundary) {
                            partCurrent = partBody;
                        }
                        else {
                            partCurrent = partHeader;
                        }
                        
                        // Calculate the total length of all the chunks that have already been received
                        var partCurrentLength = 0;
                        for (var i = 0; i < partCurrent.length; i++) {
                            partCurrentLength += partCurrent[i].length;
                        }
                        
                        if (partCurrentLength > node.maximum) {
                            node.error("The part size has exceeded the maximum of " + node.maximum,msg);
                            return;
                        }
                                
                        // When starting with a new chunk and a previous chunk is available, check whether the search string is 
                        // splitted across two chunks.  Indeed data is splitted into chunks by the transport layer, which has 
                        // no knowledge of the protocol being used (so vital data might be splitted).
                        if (checkOverlap == true) {
                            checkOverlap = false;
                            
                            // For a searchString of N characters, create a new buffer containing the last N-1 characters
                            // of the previous chunk and N-1 characters of the current chunk.
                            var previousChunk = partCurrent[partCurrent.length - 1];
                            var previousTrail = previousChunk.slice(previousChunk.length - searchString.length + 1);
                            var currentLead   = chunk.slice(0, searchString.length-1);
                            var chunkOverlap  = Buffer.concat([previousTrail, currentLead]);    
                            
                            searchIndex = chunkOverlap.indexOf(searchString);
                            if (searchIndex >= 0) {
                                // Cut off the previous body chunk at the position where the search string starts
                                partCurrent[partCurrent.length - 1] = previousChunk.slice(0, previousChunk.length - searchString.length + searchIndex + 1);
                                
                                // Adjust the start of the current chunk
                                chunk = chunk.slice(searchIndex + 1);
                            }
                        }
                        else {
                            if (searchString == boundary && contentLength > 0) {                               
                                // Check whether enough data chunks have been received (i.e. more than the required contentLenght)
                                if (partCurrentLength + chunk.length >= contentLength) {
                                    // Calculate how many bytes from (the start of) the new chunk are needed, to get the entire content
                                    searchIndex = contentLength - partCurrentLength;
                                }
                                else {
                                    // Not enough data chunks have been received yet
                                    searchIndex = -1;
                                }
                                var testIndex = searchIndex;
                            }
                            else{
                                // No content-length header available, so try to find the search string in the current chunk by searching through the bytes
                                searchIndex = chunk.indexOf(searchString);
                            }

                            if (searchIndex >= 0) {                                       
                                // Store the part of the chunk data preceding the position where the search string starts
                                partCurrent.push(chunk.slice(0, searchIndex));
                           
                                // Adjust the start of the current chunk
                                chunk = chunk.slice(searchIndex + searchString.length);
                            }
                            else {
                                // Search string not found in this chunk, so store the chunk and proceed to the next chunk
                                partCurrent.push(chunk);
                                break;
                            }
                        }      
                           
                        if (searchIndex >= 0) {
                            // When a boundary has been found, this means that both the part headers and part body have been found.
                            if (searchString == boundary) {
                                 // Clone the msg (without payload for speed)
                                var newMsg = RED.util.cloneMessage(msg);

                                // Set the part headers as JSON object in the output message
                                newMsg.content = partHeadersObject;
                                                                     
                                // If a part body has been found, let's put a message on the output port
                                newMsg.payload = partBody;
                                handleMsg(newMsg, boundary, preRequestTimestamp,currentStatus, contentLength);
                                
                                // Everything has been send, so start collecting data all over again ...
                                partHeader = [];
                                partBody = [];
                                
                                // If a (non-zero) throttling delay is specified, the upload should be pauzed during that delay period.
                                // If the message contains a throttling delay, it will be used if the node has no throttling delay.
                                var delay = (node.delay && node.delay > 0) ? node.delay : msg.delay;
                                if (delay && delay !== 0) {
                                    res.pause();
                                    setTimeout(function () {
                                        res.resume();
                                    }, delay);
                                }
                                
                                // Boundary found, so from here on we will try to find a headerbodyseparator
                                searchString = headerBodySeparator;                                
                            }
                            else { // When the HeaderBodySeparator has been found, this means that the part headers have been found...  
                                partHeadersObject = {};
                                contentLength = 0;
                                
                                // Convert the part headers to a JSON object (for the output message).
                                Buffer.concat(partHeader).toString('utf8').trim().split(headerSeparator).forEach(function(entry) {
                                    var entryArray = entry.split(":");
                                    if (entryArray.length == 2) {
                                        // Convert all the string values to primitives (boolean, number, ...)
                                        var name = entryArray[0].trim();
                                        var value = autoParse(entryArray[1].trim());   
                                        partHeadersObject[name] = value;
                                        
                                        // Try to find the content-length header variable, which is optional
                                        if (name.toLowerCase() == 'content-length') {
                                            if (isNaN(value)) {
                                                // Don't return because we simply ignore the content-lenght (i.e. search afterwards the 
                                                // boundary through the data chunks).
                                                node.warn("The content-length is not numeric");
                                            }
                                            else {
                                                contentLength = value;
                                            }
                                        }
                                    }
                                });

                                // HeaderBodySeparator has been found, so from here on we will try to find a boundary
                                searchString = boundary;
                            }  
                        }
                    }
                });
                res.on('end',function() {
                    if(boundary) {
                        // If streaming is interrupted, the last part might not be complete (so skip it)
                        node.status({});
                    }
                    else {
                        // Send the latest part on the output port
                        handleMsg(msg, boundary, preRequestTimestamp, currentStatus, 0);
                    }
                });
            });
            req.setTimeout(node.reqTimeout, function() {
                node.error(RED._("server not responding"),msg);
                setTimeout(function() {
                    node.status({fill:"red",shape:"ring",text:"server not responding"});
                },10);
                req.abort();
                node.prevReq = null;
                node.prevRes = null;
            });
            req.on('error',function(err) {
                node.error(err,msg);
                msg.payload = err.toString() + " : " + url;
                msg.statusCode = err.code;
                node.send(msg);
                node.status({fill:"red",shape:"ring",text:err.code});
            });
            if (payload) {
                req.write(payload);
            }
            req.end();
        });

        this.on("close",function() {
            if (node.prevReq) {
                // At (re)deploy make sure the streaming is closed, otherwise e.g. it keeps sending data across already (visually) removed wires
                node.prevReq.abort();
                node.prevReq = null;
                node.prevRes = null;
            }
            
            node.status({});
        });
    }

    RED.nodes.registerType("multipart-decoder",MultiPartDecoder,{
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });
}
