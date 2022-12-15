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
    var mustache = require("mustache");
    var autoParse = require('auto-parse'); 
    var Buffers = require('node-buffers');
    var axios = require('axios');
    var AxiosDigestAuth = require('@mhoc/axios-digest-auth');
    
    // Syntax from RFC 2046 (https://stackoverflow.com/questions/33619914/http-range-request-multipart-byteranges-is-there-a-crlf-at-the-end) :
    // ...
    // EOL (considered as part of the boundary): if there are two EOL's, the first one is part of the body (and must be send in output msg)
    // boundary + optional whitespaces (added by a gateway, which must be deleted)
    // EOL (end of the boundary)
    // header1:value1 (optional)
    // EOL (end of the first part header key/value pair)
    // ...
    // headerN:valueN (optional)
    // EOL (end of the N-the part header key/value pair)
    // EOL (end of the part headers area, and start of the part body)    
    // part body
    // ...
    function MultiPartDecoder(n) {
        RED.nodes.createNode(this,n);
        this.delay                  = n.delay;
        this.url                    = n.url;
        this.authentication         = n.authentication;
        this.ret                    = n.ret || "txt";
        this.maximum                = n.maximum;
        this.blockSize              = n.blockSize || 1;
        this.activeResponse         = null;
        this.isPaused               = false;
        this.statusUpdated          = false;
        this.timeoutOccured         = false;
        this.timestampLastChunk     = 0;

        var node = this;

        if (n.tls) {
            var tlsNode = RED.nodes.getNode(n.tls);
        }
 
        function sleep(milliseconds) {
            return new Promise(resolve => setTimeout(resolve, milliseconds));
        } 

        async function handleChunk(chunk, msg) {
            var next = "";
            var pos = {};
            
            if (!Buffer.isBuffer(chunk)) {
                // If the 'setEncoding(null)' fix above doesn't work anymore in a future Node.js release, make sure we notice that.
                throw new Error("HTTP Request data chunk not a Buffer");
            }
            
            if (node.chunks.length > node.maximum) {
                // Avoid keeping searching endless (e.g. for boundary, eol, ...), and consuming all memory
                node.error("Chunked data length (" + node.chunks.length + ") exceeds the maximum (" + node.maximum + ")",msg);
                node.status({fill:"red",shape:"ring",text:"Max length exceeded"});
                node.statusUpdated = true;
                stopCurrentResponseStream();
                return;
            }
                    
            // Make sure we only search through the new chunk, since we might have been searching through the previous chunks already.
            // When the node.searchString contains 'abcdefg', make sure you also search part of in the previous chunks (because the end of 
            // the previous chunk could contain 'abcdef', while the last 'g' is in the new chunk).
            // Remark: be aware that there might be not enough previous data available (i.e. size shorter than node.searchString) => minimum 0
            var offset = Math.max(0, node.chunks.length - node.searchString.length + 2);
            
            // When starting with a new chunk one or more previous chunks could be already available, when the current part 
            // is splitted across multiple chunks.  Indeed data is splitted into chunks by the NodeJs, undependent of the content.
            // Since concatenating buffers is bad for performance, we will store the individual buffers in a list.  The Buffers
            // package allows us to treat the multiple buffers as a single buffer (e.g. searching a pattern across buffers).
            // These chunks can be very long, but also very short...
            node.chunks.push(chunk);
            
            // Keep track when the last chunk has arrived
            node.timestampLastChunk = Date.now();
            
            // When there is a problem getting the data over http, we will stop streaming and start collecting the entire error content
            if (node.activeResponse.status < 200 || node.activeResponse.status > 299) {
                // As soon as the problem is detected, clear (once) all previous data from the chunks.
                if (!node.problemDetected) {
                    node.chunks.splice(0, node.chunks.length - chunk.length);
                    node.partHeadersObject = {};
                    node.problemDetected = true;
                }
                
                // Skip streaming
                return;
            }
        
            // -----------------------------------------------------------------------------------------
            // Parsing global headers (at the start of the stream) :
            //  - Automatically check whether multipart streaming is required 
            //  - Determine which boundary text is going to be used during streaming
            // -----------------------------------------------------------------------------------------
            if (!node.boundary) {
                var contentType = node.activeResponse.headers["content-type"];
                
                if (!/multipart/.test(contentType)) {
                    node.error("A multipart stream should start with content-type containing 'multipart'",msg);
                    node.status({fill:"red",shape:"ring",text:"no multipart url"});
                    node.statusUpdated = true;
                    stopCurrentResponseStream();
                    return;                        
                }
                    
                // Automatically detect the required boundary (that will be used between parts of the stream).
                // Remark: unwanted whitespaces should be ignored (\s*).                        
                node.boundary = (contentType.match(/.*;\s*boundary=(.*)/) || [null, null])[1];

                if(!node.boundary) {
                    node.boundary = 'error';
                    node.status({fill:"red",shape:"ring",text:"no boundary"});
                    node.statusUpdated = true;
                    stopCurrentResponseStream();
                    return;
                }
                
                // A boundary might contain colon's (:), for example "gc0p4Jq0M:2Yt08jU534c0p" to indicate that it consists out of multiple parts. 
                // And that each of those parts is syntactically identical to an RFC 822 message, except that the header area might be completely 
                // empty.  Such boundaries must be specified in the global header between quotations marks ("..."), which must be removed here.
                node.boundary = node.boundary.trim();
                node.boundary.replace('"', '');

                // A boundary needs to start with -- (even if -- is absent in the http header)
                if (!node.boundary.startsWith('--')) {
                    node.boundary = '--' + node.boundary;
                }
                
                // The boundary should arrive at the start of the stream, so let's start searching for it.
                // Remark: we will look for boundary string (instead of the eol that should be available before the boundary),
                // because the protocol allows also eol's in the part body !!
                node.searchString = node.boundary;                
            }
            
            if (node.boundary === 'error') {
                // Make sure no data chunks are being processed, since we don't know which boundary we will have to search.
                // Otherwise chunks will be collected into memory, until memory is full ...
                 return;                        
            }
            
            // -----------------------------------------------------------------------------------------
            // End-of-line (EOL determination).
            //
            // The EOL sequence is required for parsing, and can have one of the following values:
            // - LF   = linefeed ( \n ) // EOL for Unix and Linux and Macintosh (Mac OSX) systems
            // - CR   = carriage return ( \r ) for old Macintosh systems
            // - CRLF = carriage return linefeed ( \r\n ) for Windows systems
            //  
            // Debugging tip: \r = ASCII character 13 and \n = ASCII character 10
            // -----------------------------------------------------------------------------------------
            if(!node.eol) {
                // Try to find the first boundary in the stream
                node.searchIndex = node.chunks.indexOf(node.boundary, 0);
                
                if (node.searchIndex == -1) {
                    // The received chunks don't contain the boundary yet, so try again when the next chunk arrives ...
                    return;
                }
                    
                // The sender can (optionally) send a preambule before the first boundary.  That is explanatory note for non-MIME 
                // conformant readers, which should be skipped !
                node.chunks.splice(0, node.searchIndex);
                
                // We will investigate the 2 (first non-empty) bytes after the boundary, which should contain the EOL (which is 1 or 2 bytes long).
                // Notice that spaces might be available between the eol and the boundary.
                for (var i = node.boundary.length; i < node.chunks.length; i++) {
                    next = node.chunks.get(i);
                   
                    // Skip all the whitespaces, and then select the next two bytes (or one byte if we reached the end of the current chunk)
                    if (next != ' ') {
                        node.eol = node.chunks.slice(i, i + 2).toString();
                        break;
                    }
                }
                    
                if (node.eol.length < 2) {
                    // When we haven't found two (non-empty) bytes yet, let's start all over again when the next chunk arrives.
                    node.eol = "";
                    return;
                }
                
                if (node.eol.charAt(0) !== '\r' && node.eol.charAt(0) !== '\n') {
                    node.eol = 'error';
                    node.error("Invalid EOL (" + node.eol + ") found",msg);
                    node.status({fill:"red",shape:"ring",text:"invalid eol"});
                    node.statusUpdated = true;
                    stopCurrentResponseStream();
                    return;
                }
                
                if (node.eol.charAt(1) !== '\r' && node.eol.charAt(1) !== '\n') {
                    node.eol = node.eol.charAt(0);
                }
                
                // Now everything is ready to start the stream.  Currently a number of slices could already have been received (during
                // boundary and EOL detection).  Make sure the stream startup starts from the beginning of the stream.
                offset = 0;
            }
            
            if(node.eol === 'error') {
                //node.error("Ignoring received data, since no EOL could be found",msg);
                return;
            }

            // -----------------------------------------------------------------------------------------
            // Stream the data in the newly arrived chunk
            // -----------------------------------------------------------------------------------------
            
            if(node.searchString === 'error') {
                //node.error("Ignoring received data, since the part data has been exceeded",msg);
                return;
            }
            
            // Let's loop, since a single (large) data chunk could contain multiple (short) parts
            while (true) { 
                node.searchIndex = -1;
            
                // The boundary search can be skipped, if the content length is specified in the stream (in the part headers).
                // Indeed it is much faster to simply get the N specified bytes, instead of searching for the boundary through all the chunk data...
                // Remark: for the first part the boundary will always be searched using indexof, but for the next parts the contentLength will be used.
                if (node.searchString === node.boundary && node.contentLength > 0) {                               
                    if (node.chunks.length < node.contentLength + node.boundary.length) {
                        // We have not received enough chunk data yet (i.e. less than the required contentLenght), so we didn't found the boundary yet
                        node.searchIndex = -1;
                    }
                    else {
                        // Based on the content length, determine where the boundary will be located (in the chunk data)
                        node.searchIndex = node.contentLength;
                    }
                }
                else {                          
                    // Search for the specified string in the received chunk data (which will use lot's of CPU for large data chunks)
                    node.searchIndex = node.chunks.indexOf(node.searchString, offset);                          
                }
                
                // Make sure the offset is not used afterwards (during processing of the 'same' new data chunk)
                offset = 0;

                if (node.searchIndex < 0) { 
                    // Since we didn't find our node.searchString in the received chunks, we will have to wait until the next chunk arrives
                    return;
                }                      
                
                // When a boundary has been found, this means that both the part headers and part body have been found.
                // Store all this part information in a single message, and send it to the output port.
                if (node.searchString === node.boundary) {
                    // Useless to send an empty message when the boundary is found at index 0 (probably at the start of the stream)
                    if (node.searchIndex > 0) {
                        // Seems a part body has been found ...
                        
                        // Convert the Buffers list to a single NodeJs buffer, that can be understood by the Node-Red flow
                        var part = node.chunks.splice(0, node.searchIndex).toBuffer();
                        
                        // Store the part in the block array
                        node.blockParts.push(part);
                        part = null;
                        
                        // Only send a message when the block contains the required number of parts
                        if (node.blockParts.length == node.blockSize) {
                            // Clone the msg (without payload for speed)
                            var newMsg = RED.util.cloneMessage(msg);

                            // Set the part headers as JSON object in the output message
                            newMsg.content = node.partHeadersObject;
                                                                 
                            newMsg.payload = node.blockParts;
                            
                            sendOutputMessage(newMsg, node.boundary, node.contentLength);
                            
                            // Start with a new empty block
                            node.blockParts = [];
                        }
                        
                        if (node.isPaused) {
                            // Check every second if the stream still needs to stay paused
                            while (node.isPaused) {
                                await sleep(1000);
                            }
                        }
                        else {
                            // If a (non-zero) throttling delay is specified, the upload should be pauzed during that delay period.
                            // If the message contains a throttling delay, it will be used if the node has no throttling delay.
                            var delay = parseInt((node.delay && node.delay > 0) ? node.delay : msg.delay);
                            if (delay && delay !== 0) {
                                await sleep(delay);
                            }
                        }
                    }                               
                }
                else { // When the header-body-separator has been found, this means that the part headers have been found...  
                    node.partHeadersObject = {};
                    node.contentLength = 0;
                    
                    // Convert the part headers to a JSON object (for the output message later on)
                    node.chunks.splice(0, node.searchIndex).toString('utf8').trim().split(node.eol).forEach(function(entry) {
                        var entryArray = entry.split(":");
                        if (entryArray.length == 2) {
                            // Convert all the string values to primitives (boolean, number, ...)
                            var name = entryArray[0].trim();
                            var value = autoParse(entryArray[1].trim());   
                            node.partHeadersObject[name] = value;
                            
                            // Try to find the content-length header variable, which is optional
                            if (name.toLowerCase() == 'content-length') {
                                if (isNaN(value)) {
                                    // Don't return because we simply ignore the content-length (i.e. search afterwards the 
                                    // boundary through the data chunks).
                                    node.warn("The content-length is not numeric");
                                }
                                else {
                                    node.contentLength = value;
                                }
                            }
                        }
                    });
                } 

                // Also remove the searchString, since that is not needed anymore.
                node.chunks.splice(0, node.searchString.length);
                
                // Switch to the other search string, for our next search ...
                if (node.searchString === node.boundary) {                            
                    // Boundary found, so from here on we will try to find a header-body-separator
                    // The header-body-separator consists out of TWO EOL sequences !!!!
                    node.searchString = node.eol + node.eol; 
                }
                else {
                    // The header-body-separator has been found, so from here on we will try to find a boundary
                    node.searchString = node.boundary;
                }
            }
        }

        function stopCurrentResponseStream() {
            // Quit the pause (sleep) loop
            node.isPaused = false;
            
            // Quit the loop that reads continiously chunks from the response stream
            node.activeResponse = null;
            
            node.status({fill:"blue",shape:"dot",text:"stopped"});
            
            if(node.timeoutCheck) {
                clearInterval(node.timeoutCheck);
                node.timeoutCheck = null;
            }
        }

        function sendOutputMessage(msg, boundary, contentLength) {
            // Convert all the parts in the payload to the required type (currently 'bin')
            if (node.ret !== "bin") {
                for (var i = 0; i < msg.payload.length; i++) {
                    msg.payload[i] = msg.payload[i].toString('utf8'); // txt
                    
                    if (node.ret === "obj") {
                        try { msg.payload[i] = JSON.parse(msg.payload[i]); } // obj
                        catch(e) { node.warn("JSON parse error"); }
                    }
                }
            }
            
            // When no blocks are required, the block size will be 1.
            // In that case we will send the part itself in the output, not in a single-element array!
            if (msg.payload.length === 1) {
                msg.payload = msg.payload[0];
            }
                                 
            node.send([msg, null]);
            
            if (msg.statusCode < 200 || msg.statusCode > 299) {
                // When there is a problem getting the data over http, we will show the error
                node.error(msg.statusMessage, msg);
                node.status({fill:"red",shape:"ring",text:msg.statusMessage});
            }
            else {
                if (boundary && (Date.now() - node.currentStatus.timestamp) > 1000) {
                    // For multipart streaming, the node status is inverted every second (to let user know it is still busy processing). 
                    // This means the status will start flashing: empty -> Streaming -> empty -> Streaming -> empty -> Streaming -> ...
                    if (Object.keys(node.currentStatus.value).length === 0 /*empty object*/) {
                        // Display another ring when content-length is available or not
                        if (contentLength > 0) {
                            node.currentStatus.value = {fill:"blue",shape:"dot",text:"streaming"};
                        }
                        else {
                            node.currentStatus.value = {fill:"blue",shape:"ring",text:"streaming"};
                        }
                    }
                    else {
                        node.currentStatus.value = {};
                    }
                    
                    node.status(node.currentStatus.value);
                    node.currentStatus.timestamp = Date.now();
                }
            }
        }

        // Starting from version 2.0.0 we will use another mechanism:
        // - All new chunks are being stored in a buffer list: treat multiple buffers as a single one (but don't concat them for performance).
        // - We will look (for boundaries and header/body separators) in the buffer list, which has the advantage that it also looks in buffer overlaps.
        // - As soon as data (i.e. parts of chunks or complete chunks) have been processed, they will be removed from the buffer list.
        //
        // To accomplish this, I use the 'node-buffers' package as buffer list (https://github.com/dashevo/node-buffers).  
        // This package is not very popular at the moment, but I didnt find a decent alternative:
        // - The 'bl' package (https://github.com/rvagg/bl) is well maintained, but the indexof pull request has never been merged (https://github.com/rvagg/bl/pull/30).
        // - The 'vise' package (https://github.com/hapijs/vise) is pretty new, but it also doesn't have an indexof function.
        // - The 'node-bufferlist' package (https://github.com/substack/node-bufferlist) is deprecated.  Succesor is the 'buffers' package that I use.
        // - The 'buffers' package (https://github.com/substack/node-buffers), which is the successor of the node-bufferlist package.  However it hasn't been
        //   maintained for some years, so it contains some bugs.
        // The node-buffers package is a fork of the buffers package, and contains some bugfixes.
        //
        // Some remarks about the usage of the 'buffers' package:
        // - A slice results in a copy of the required buffer data !!!  This is in contractiction to a slice from a NodeJs buffer !!
        //   So only use slices for small amounts of data, like part headers.  Not for content data (because this would result e.g. in cloning entire images).
        // - A splice results in removals of buffers from the list, and (NodeJs buffer) slicing.  So here no data cloning is involved, which means better performance.
        // Summary: avoid using 'splice', except for short data snippets. Prefer 'splice' wherever the specified data is not needed anymore afterwards.
        //
        // Add following variables to the watch window of the Chrome debugger, to troubleshoot faster:
        // - chunk.toString()
        // - chunks.toString()
        // - searchIndex
        // - searchString
        this.on("input", async function(msg) {
            node.status({fill:"blue",shape:"dot",text:"requesting"});

            // Caution: node.activeResponse.body.pause() doesn't work since node-fetch hasn't implemented it
            if (msg.hasOwnProperty("pause") && msg.pause === true) {
                if (!node.activeResponse) {
                    // No response body stream active, i.e. no connection to the sender
                    node.warn("There is no stream active");
                }
                else if (node.isPaused) {
                    node.warn("The active stream is already paused");
                }
                else {
                    // Pause the stream by starting to sleep (infinite long), i.e. by stopping to read chunks from the active stream.
                    // The original NodeJs response instance has pause/resume/isPaused methods, but those aren't exposed by most libraries
                    // (undici/node-fetch/urrlib/axios/...).  So instead of pausing the response instance from calling our data handler,
                    // we will instead stop reading chunks from that response instance.  Note that we will do this by calling the 'sleep'
                    // function, and not by stopping the loop to read chunks.  Because when the loop is stopped, then Axios will abort
                    // the active response stream completely...
                    node.isPaused = true;
                }                            
                
                return;
            }

            // Caution: node.activeResponse.body.resume() doesn't work since node-fetch hasn't implemented it
            if (msg.hasOwnProperty("resume") && msg.resume === true) {
                if (!node.activeResponse) {
                    // No response body stream active, i.e. no connection to the sender
                    node.warn("There is no stream active");
                }
                else if (!node.isPaused) {
                    node.warn("The active stream is already running");
                }
                else {
                    // Resume the stream by stopping to sleep, which means our loop will read chunks again from the response stream.
                    node.isPaused = false;
                }                            
                
                return;
            }
            
            // If a previous request is still busy (endless) streaming, then stop it (undependent whether msg.stop exists or not)
            stopCurrentResponseStream();
            
            if (msg.hasOwnProperty("stop") && msg.stop === true) {
                node.statusUpdated = true;

                // When returning, the previous stream has been aborted (above) and no new stream will be started (below).
                return;
            }
                   
            // When no url has been specified in the node config, the 'url' value in the input message will be used
            var url = node.url || msg.url;
            
            // The url can contain Mustache placeholders (triple {{{ ), which should be resolved by the corresponding input message fields.
            if (url && url.indexOf("{{") >= 0) {
                url = mustache.render(node.url,msg);
            }

            if (!url) {
                node.error("No url specified", msg);
                node.status({fill:"red",shape:"dot",text:"no url"});
                node.statusUpdated = true;
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
 
            // When a timeout has been specified in the settings file, we should take that into account
            if (RED.settings.httpRequestTimeout) { 
                this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000; 
            }
            else { 
                this.reqTimeout = 120000; 
            }
            
            var fetchOptions = {};
            fetchOptions.method = 'GET';
            fetchOptions.headers = {};

            if (msg.headers) {
                for (var v in msg.headers) {
                    if (msg.headers.hasOwnProperty(v)) {
                        var name = v.toLowerCase();
                        fetchOptions.headers[name] = msg.headers[v];
                    }
                }
            }

            if (tlsNode) {
                tlsNode.addTLSOptions(fetchOptions);
            }

            //var chunkSize = 30;
            //fetchOptions.highWaterMark = chunkSize;
            
            // Reset all the parameters required for a new stream
            node.searchString = "";
            node.chunks = Buffers();
            node.searchIndex = -1;
            node.contentLength = 0;
            node.partHeadersObject = {};
            node.problemDetected = false;
            node.blockParts = [];
            node.boundary = "";
            node.eol = "";
            node.currentStatus = {timestamp:0, value:'{}'};

            // Send the http request to the client, which should respond with a http stream
            try {
                switch(node.authentication) {
                    case "basic":
                        node.activeResponse = await axios.get(url, {
                            auth: {
                                username: node.credentials.user,
                                password: node.credentials.password
                            },
                            responseType: 'stream'
                        }).catch(err => {
                            throw(err);
                        });
                        break;
                    case "bearer":
                        // TODO this is not available in the config screen yet...
                        node.activeResponse = await axios.get(url, {
                            headers: {Authorization: `Bearer ${node.credentials.token}`}, 
                            responseType: 'stream'
                        });

                        break;
                    case "digest":
                        const digestAuth = new AxiosDigestAuth.default({
                            username: node.credentials.user,
                            password: node.credentials.password
                        });

                        node.activeResponse = await digestAuth.request({
                            method: "GET",
                            url: url,
                            responseType: "stream"
                        }).catch(err => {
                            throw(err);
                        });
                        break;
                    default: // case 'none'
                        node.activeResponse = await axios.get(url, {
                            responseType: 'stream'
                        });
                        break;
                }
            }
            catch(err) {
                node.error(err.message,msg);
                
                msg.payload = err.message
                msg.statusCode = err.response.status;
                msg.statusMessage = err.response.statusText;

                node.send([null, msg]);
                node.status({fill:"red",shape:"ring",text:err.code});
                
                stopCurrentResponseStream();
                node.statusUpdated = false;
                
                return;
            }
  
            // Force NodeJs to return a Buffer (instead of a string): See https://github.com/nodejs/node/issues/6038
            //node.activeResponse.setEncoding(null);
            //delete node.activeResponse._readableState.decoder;
                  
            msg.statusCode = node.activeResponse.status;
            msg.statusMessage = node.activeResponse.statusText;
            msg.headers = node.activeResponse.headers;
            //TODO msg.responseUrl = node.activeResponse.responseUrl;
            msg.payload = [];

            node.activeResponse.data.on('end', () => {
                if(node.timeoutCheck) {
                    clearInterval(node.timeoutCheck);
                    node.timeoutCheck = null;
                }
                    
                if(node.boundary) {
                    // If streaming is interrupted, the last part might not be complete: skip sendOutputMessage...
                    
                    // Reset the status (to remove the 'streaming' status).
                    // Except when the nodes is being stopped manually, otherwise the 'stopped' status will be overwritten
                    if (!node.statusUpdated) {
                        node.status({});
                    }
                }
                else {
                    // Let's handle all remaining data...
                    
                    // Convert the Buffers list to a single NodeJs buffer, that can be understood by the Node-Red flow
                    var part = node.chunks.splice(0, node.chunks.length).toBuffer();
                                                    
                    // Store the data in the block array
                    node.blockParts.push(part);
                            
                    // Clone the msg (without payload for speed)
                    var newMsg = RED.util.cloneMessage(msg);

                    // Set the part headers as JSON object in the output message
                    newMsg.content = node.partHeadersObject;
                                                         
                    newMsg.payload = node.blockParts;
                            
                    // Send the latest part on the output port
                    sendOutputMessage(newMsg, node.boundary, 0);
                }
                node.statusUpdated = false;
            })
//TODO timeouts opvangen
            // Not only a request can fail, but also a response can fail.
            // See https://github.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/issues/4
            node.activeResponse.data.on('error', (err) => {
                if (err.message === "aborted") {
                    node.status({fill:"blue",shape:"dot",text:"stopped"});
                }
                else {
                    node.error(err,msg);
                    msg.payload = err.toString() + " : " + url;

                    if (node.activeResponse) {
                        msg.statusCode = node.activeResponse.statusCode;
                        msg.statusMessage = node.activeResponse.statusMessage;
                    }
                    else {
                        msg.statusCode = 400;
                    }

                    node.status({fill:"red",shape:"ring",text:err.code});

                    node.send([null, msg]);

                    node.statusUpdated = false;
                }
            })

            // Run a check every second
            node.timeoutCheck = setInterval(function() {
                // If no chunk has arrived during the specified timeout period, then abort the stream
                if(Date.now() - node.timestampLastChunk > node.reqTimeout) {
                    node.timeoutOccured = true;
                    stopCurrentResponseStream();
                }
            }, 1000);

            /* TODO not sure anymore why this has been added
            if (payload) {
                node.activeRequest.write(payload);
            }
            */

            // Once the new active response is readable, start reading chunks from it.
            // Note that node.activeResponse.data is a readable stream.
            for await (const chunk of node.activeResponse.data){
                if (!node.activeResponse) {
                    // Seems that stopCurrentResponseStream has been called, so let's stop reading chunks from the active response.
                    // As soon as this loop is being stopped, Axios will abort the stream...
                    break;
                }
                else {
                    await handleChunk(chunk, msg);
                }
            }

        });

        this.on("close",function() {
            // At (re)deploy make sure the streaming is closed, otherwise e.g. it keeps sending data across already (visually) removed wires
            stopCurrentResponseStream();
            
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
