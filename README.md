# node-red-contrib-multipart-stream-decoder
Node-Red node for decoding multipart streams over http

Note about version ***0.0.2***: [Simon Hailes](https://github.com/btsimonh) has been testing version 0.0.1 thoroughly.  To be able to solve all the issues, the decoding algorithm had to be rewritten to the utmost extend.

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-multipart-stream-decoder
```
## Usage
The goal is to decode a stream of data elements that arrive via http.  These elements can contain any kind of data (text, images, ...). 

The most known multipart stream is the **MJPEG stream**, which is used to get IP camera images at high speed:
+ **Snapshot URL:** The standard Node-Red *HttpRequest* node can be used to get a single (snapshot) image from the IP camera, by entering the snapshot URL in the config screen.  Using an interval node this can be repeated, e.g. to get a camera image every second:

    ![Snapshot url](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_snapshot_url.png)
    ```
    [{"id":"9bbed4ae.37a4f8","type":"base64","z":"47b91ceb.38a754","name":"Encode","x":420,"y":332,"wires":[["2f3ce560.9b0baa","cf80e726.d3eaa8"]]},{"id":"a5475243.f67c4","type":"http request","z":"47b91ceb.38a754","name":"","method":"GET","ret":"bin","url":"http://xxx.xxx.xxx.xxx/SnapshotJPEG?Resolution=320x240&Quality=High","tls":"","x":237.63544845581055,"y":331.3958396911621,"wires":[["9bbed4ae.37a4f8"]]},{"id":"bbc65977.8dc1f8","type":"interval","z":"47b91ceb.38a754","name":"interval","interval":"1","onstart":false,"msg":"ping","showstatus":false,"unit":"seconds","statusformat":"YYYY-MM-D HH:mm:ss","x":82.59029769897461,"y":330.8220520019531,"wires":[["a5475243.f67c4"]]},{"id":"2f3ce560.9b0baa","type":"ui_template","z":"47b91ceb.38a754","group":"4f44306b.c5a07","name":"Display image","order":1,"width":"6","height":"6","format":"<img width=\"16\" height=\"16\" alt=\"mjpeg test...\" src=\"data:image/jpg;base64,{{msg.payload}}\" />\n","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":620,"y":332,"wires":[[]]},{"id":"4f44306b.c5a07","type":"ui_group","z":"47b91ceb.38a754","name":"Kitchen","tab":"72e36c60.254134","order":1,"disp":true,"width":"6"},{"id":"72e36c60.254134","type":"ui_tab","z":"47b91ceb.38a754","name":"Cameras","icon":"camera_alt","order":2}]
    ```
    However the frame rate will not be high, due to the large amount of overhead and waiting (request - response - request - response- request - ...).  So you won't get a smooth video this way ...
    
+ **MPJEG stream URL**: Every IP camera nowadays will also offer (beside to the snapshot URL) an MJPEG stream URL, that can be used to start an MJPEG stream.  This decoder node can be used to get an infinite stream of images from the IP camera, simply by entering the MJPEG stream URL in the config screen. Use a trigger node to start the stream 'once':

    ![Stream url](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_stream_url.png)
    ```
    [{"id":"db5630e7.83cdc","type":"multipart-decoder","z":"47b91ceb.38a754","name":"","ret":"bin","url":"http://xxx.xxx.xxx.xxx:50000/nphMotionJpeg?Resolution=320x240&Quality=High","tls":"","delay":0,"maximum":"10000000","x":490,"y":1280,"wires":[["6535feb.cbf33"]]},{"id":"dfcc9a31.860948","type":"inject","z":"47b91ceb.38a754","name":"Start stream","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":"","x":289.8333435058594,"y":1280.0000381469727,"wires":[["db5630e7.83cdc"]]},{"id":"6535feb.cbf33","type":"base64","z":"47b91ceb.38a754","name":"Encode","x":680,"y":1280,"wires":[["fb64a032.e945b"]]},{"id":"fb64a032.e945b","type":"ui_template","z":"47b91ceb.38a754","group":"1a7f6b0.0560695","name":"Display image","order":1,"width":"6","height":"6","format":"<img width=\"16\" height=\"16\" alt=\"stream test\" src=\"data:image/jpg;base64,{{msg.payload}}\" />\n","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":857.2569236755371,"y":1280.4166660308838,"wires":[[]]},{"id":"1a7f6b0.0560695","type":"ui_group","z":"","name":"Performance","tab":"18b10517.00400b","disp":true,"width":"6"},{"id":"18b10517.00400b","type":"ui_tab","z":"","name":"Performance","icon":"show_chart","order":5}]
    ```
    It is as simple as that ...
    
In both cases the image needs to be ***base64*** encoded before displaying it (in the dashboard or in the flow editor), to avoid problems with characters getting lost.  And in both cases the output type of the capture nodes (HttpRequest or MultipartStreamDecoder) should be ***Bufferr***, to avoid again that characters are being messed up.  After all, you don't want to end up with invalid images ...

***The decoder converts a continious stream into separate messages, whose payloads contain the received data.***  For example converting a continous MJPEG stream (from a camera) into separate images:

![Stream decoder](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_decoder.png)

However - besides to MJPEG - lots of other multipart stream use cases exist.  For example the Hikvision cameras offer multipart alert streams (see [manual](http://oversea-download.hikvision.com/uploadfile/Leaflet/ISAPI/HIKVISION%20ISAPI_2.0-IPMD%20Service.pdf) section 8.11.30) for continiously communicating all their statusses (pir, motion, ...) as XML strings.

### Streaming basics
When we execute a HTTP request, the result will be a HTTP response containing the result data.  For example every camera provides an URL that can be used to get a single snapshot image.  However that mechanism isn't fast enough to get fluent video, due to the time interval between every request and response.  

To get images very fast, we will need to setup streaming.  When we send a single HTTP request, we want to get an (in)finite HTTP response:

![Request response](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_reqresp.png)

For example every camera will provide an URL for MJPEG streaming.  

This way the response has become endless (with a *boundary* string as separator between the images):
```
   global headers
   part headers 
   image
   boundary
   part headers
   image
   boundary
   part headers
   image
   boundary 
   ...
```

A test flow to show different streams from public IP cameras:

![Request response](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_flow.png)

```
[{"id":"c4261d3c.0f8f9","type":"inject","z":"57188ccd.92d204","name":"Street view full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":437,"y":260,"wires":[["951697d4.c20318"]]},{"id":"deb4733b.370e3","type":"base64","z":"57188ccd.92d204","name":"Encode","x":1073,"y":346,"wires":[["ba663d59.1420e"]]},{"id":"951697d4.c20318","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://mbewebcam.rhul.ac.uk/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":661.7093048095703,"y":260.0633544921875,"wires":[["df0434ac.67b098"]]},{"id":"5aa09ace.caf6e4","type":"inject","z":"57188ccd.92d204","name":"Radio station full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":436.0921173095703,"y":346.5555419921875,"wires":[["52e61263.394cdc"]]},{"id":"52e61263.394cdc","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://185.49.168.74:8001/axis-cgi/mjpg/video.cgi","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":663.8014068603516,"y":346.618896484375,"wires":[["df0434ac.67b098"]]},{"id":"7b3f810f.f6aae","type":"comment","z":"57188ccd.92d204","name":"Camera with street view (resolution 704x576)","info":"","x":481.3382110595703,"y":223.692249417305,"wires":[]},{"id":"6f04f96f.b49fa8","type":"comment","z":"57188ccd.92d204","name":"Camera at radio station (resolution 704x576)","info":"","x":480.0921173095703,"y":311.3055419921875,"wires":[]},{"id":"1894d838.cb8818","type":"inject","z":"57188ccd.92d204","name":"Pacific beach full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":436.3264923095703,"y":428.3055419921875,"wires":[["9057b455.4b1398"]]},{"id":"9057b455.4b1398","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://66.175.76.125/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":660.0357818603516,"y":428.368896484375,"wires":[["df0434ac.67b098"]]},{"id":"37f73a84.2b9be6","type":"comment","z":"57188ccd.92d204","name":"Pacific beach hotel (resolution 1280x960)","info":"","x":470.3264923095703,"y":393.0555419921875,"wires":[]},{"id":"df0434ac.67b098","type":"multipart-decoder","z":"57188ccd.92d204","name":"","ret":"bin","url":"","tls":"","delay":0,"maximum":"9999999999","x":886,"y":346,"wires":[["deb4733b.370e3"]]},{"id":"c6ba4e41.c8b32","type":"inject","z":"57188ccd.92d204","name":"Beach","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":386.00001525878906,"y":514,"wires":[["15878b08.4e1d45"]]},{"id":"5f7ce8fc.8fad08","type":"comment","z":"57188ccd.92d204","name":"Beach (resolution 640x480)","info":"","x":431.00001525878906,"y":478.75,"wires":[]},{"id":"15878b08.4e1d45","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://200.36.58.250/mjpg/video.mjpg?resolution=640x480","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":660.0000152587891,"y":513,"wires":[["df0434ac.67b098"]]},{"id":"1b9c9e35.6fee02","type":"ui_template","z":"57188ccd.92d204","group":"1a7f6b0.0560695","name":"Show image","order":1,"width":"6","height":"6","format":"<img width=\"16\" height=\"16\" alt=\"mjpeg test...\" src=\"data:image/jpg;base64,{{msg.payload}}\" />\n","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":1419,"y":346,"wires":[[]]},{"id":"ba663d59.1420e","type":"delay","z":"57188ccd.92d204","name":"","pauseType":"rate","timeout":"5","timeoutUnits":"seconds","rate":"1","nbRateUnits":"1","rateUnits":"second","randomFirst":"1","randomLast":"5","randomUnits":"seconds","drop":true,"x":1242,"y":346,"wires":[["1b9c9e35.6fee02"]]},{"id":"1a7f6b0.0560695","type":"ui_group","z":"","name":"Performance","tab":"18b10517.00400b","disp":true,"width":"6"},{"id":"18b10517.00400b","type":"ui_tab","z":"","name":"Performance","icon":"show_chart","order":5}]
```

Caution: a delay node has been added to reduce the number of images that are being send to the dashboard (for visualisation).  Perhaps that is not necessary for this example, but it might be required for higher framerates or higher image resolutions.  This way you make sure that we don't overload the Node-Red websocket channel with too much data, causing the browser to freeze...  Tip from Dave and Nick: make sure (in the delay node settings) that *'drop intermediate messages'* is activated, to avoid useless storage of images in memory.

### Comparison to http-request node
This decoder node is **no** replacement for the standard http-request node, and I have no intents to change that in the future (to avoid offering duplicate functionality to users and confusing them).  

Indeed, this node does only support multipart streaming URLs.  If you need normal request/response behaviour, please use Node-Red's httprequest node.  In fact, this contribution was originally intended to be an extra [addition](https://github.com/node-red/node-red/pull/1227) of the http-request node.  As a result, some of the orginal code has been adopted here!

When you try a normal (non-streaming) URL in this node, you will get an error:

![No multipart URL](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_no_multipart.png)

### Stream control
As soon as a stream is active, that stream can be controlled using input messages:
+ `msg.stop` with value *true* to abort the current stream.
+ `msg.pause` with value *true* to pause the current stream temporarily.
+ `msg.resume` with value *true* to resume the current stream after it has been paused.  

Caution about the pause/resume mechanism:
+ There will be a **gap** in the data stream!  As soon as the current stream is paused, the sender (e.g. IP camera) will detect that we don't want to receive data anymore.  As a result the sender will stop streaming data temporarily.  As soon as the stream is resumed, the sender will restart streaming data: this is the current data (e.g. current camera snapshot image), and ***not*** the data from the moment of pausing.
+ When the *pause* request is executed, it will take some time until the sender detects that we don't want to receive data anymore.  This means that the sender will still send some data before pausing.  That data will be remembered but not processed immediately, since the request is paused.  As a result, **some old data** will be processed as soon as we resume the stream (before the new data is being processed).

Note that when a new input message is sent (containing an url), the active stream will be stopped and a new stream will be started.  And when the flow is (re)deployed, the active stream will be stopped automatically.

A test flow to start, pause, resume and stop a stream:

![Flow control](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_flow_control.png)

```
[{"id":"c6b26489.abaa98","type":"inject","z":"57188ccd.92d204","name":"Radio station full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":420,"y":80,"wires":[["f6b60983.206868"]]},{"id":"f6b60983.206868","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://185.49.168.74:8001/axis-cgi/mjpg/video.cgi","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":644,"y":80,"wires":[["88ae4e6d.f3b2b"]]},{"id":"e373b377.75fc2","type":"debug","z":"57188ccd.92d204","name":"Part headers (content)","active":true,"console":"false","complete":"content","x":1120,"y":177,"wires":[]},{"id":"88ae4e6d.f3b2b","type":"multipart-decoder","z":"57188ccd.92d204","name":"","ret":"bin","url":"","tls":"","delay":0,"x":890,"y":177,"wires":[["e373b377.75fc2"]]},{"id":"76161d4b.0e93d4","type":"inject","z":"57188ccd.92d204","name":"Pause stream","topic":"","payload":"true","payloadType":"bool","repeat":"","crontab":"","once":false,"x":389.00001525878906,"y":137,"wires":[["21ea3420.d8eb9c"]]},{"id":"1def2fdc.c32e","type":"inject","z":"57188ccd.92d204","name":"Resume stream","topic":"","payload":"true","payloadType":"bool","repeat":"","crontab":"","once":false,"x":399.00001525878906,"y":177,"wires":[["36dfa96e.2d4a86"]]},{"id":"30f4b4ec.bc536c","type":"inject","z":"57188ccd.92d204","name":"Stop stream","topic":"","payload":"true","payloadType":"bool","repeat":"","crontab":"","once":false,"x":389.00001525878906,"y":217,"wires":[["d6c01f7f.34f9e"]]},{"id":"21ea3420.d8eb9c","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"pause","pt":"msg","to":"payload","tot":"msg"}],"action":"","property":"","from":"","to":"","reg":false,"x":654.0000152587891,"y":137,"wires":[["88ae4e6d.f3b2b"]]},{"id":"36dfa96e.2d4a86","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"resume","pt":"msg","to":"payload","tot":"msg"}],"action":"","property":"","from":"","to":"","reg":false,"x":654.0000152587891,"y":177,"wires":[["88ae4e6d.f3b2b"]]},{"id":"d6c01f7f.34f9e","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"stop","pt":"msg","to":"payload","tot":"msg"}],"action":"","property":"","from":"","to":"","reg":false,"x":644.0000152587891,"y":217,"wires":[["88ae4e6d.f3b2b"]]}]
```

### Throttling speed
The speed of a stream depends on a series of independent factors:
+ The speed of the sender system (e.g. IP camera): the sender could send as data at full speed, but it could also throttle the data rate. E.g. a public camera stream could be limited to N images per second.
+ The speed of the communication between sender and the decoder node.
+ The speed at which this decoder node is able to process the data from the stream.

Suppose the sender speed is unlimited (e.g. a high quality IP camera) and your network has a very good bandwith.  This means that the decoder node could receive a large amount of images to process.  As a result the decoder node could receive much more images as required.  In such cases it is advised to ***throttle*** the incoming stream (to save both CPU and memory).  This could be accomplished in various ways:
+ Let the decoder node receive images at high speed, and filter out the unneeded messages afterwards in your flow (e.g. by using the node-red-contrib-throttle node).  However this way you will ***waste*** lots of resources (memory, CPU, bandwith, ...), by processing and filtering messages that will be thrown away...
+ Let the decoder node slowing down the stream, to make sure that only the required data is being received.  This can be accomplished by specifying the minimum **delay** value (in milliseconds) between parts in the stream.  In fact, the decoder node will pause the stream sometime between every part.

A test flow to decode a stream at full speed, or throttle the stream to slow it down:

![Flow throttling](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_flow_throttle.png)

```
[{"id":"ee86d795.1e8cb8","type":"inject","z":"57188ccd.92d204","name":"Street view full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":190,"y":260,"wires":[["db5e7dd6.6675a"]]},{"id":"db5e7dd6.6675a","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://mbewebcam.rhul.ac.uk/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":615.7093048095703,"y":259.0633544921875,"wires":[["8c35709.24b749"]]},{"id":"987b33a1.c7468","type":"inject","z":"57188ccd.92d204","name":"Street view max 2/sec","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":189.3264923095703,"y":353.2222900390625,"wires":[["4fb915bb.f1e59c"]]},{"id":"4fb915bb.f1e59c","type":"change","z":"57188ccd.92d204","name":"Throttle 0.5 secs","rules":[{"t":"set","p":"delay","pt":"msg","to":"500","tot":"num"}],"action":"","property":"","from":"","to":"","reg":false,"x":400.99314880371094,"y":353.22235107421875,"wires":[["db5e7dd6.6675a"]]},{"id":"835f29a7.efb048","type":"debug","z":"57188ccd.92d204","name":"Part headers (content)","active":true,"console":"false","complete":"content","x":1080,"y":260,"wires":[]},{"id":"1fd394ce.1969bb","type":"inject","z":"57188ccd.92d204","name":"Street view max 10/sec","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":190.0921173095703,"y":307.3055419921875,"wires":[["14a33ef5.687651"]]},{"id":"14a33ef5.687651","type":"change","z":"57188ccd.92d204","name":"Throttle 0.1 secs","rules":[{"t":"set","p":"delay","pt":"msg","to":"100","tot":"num"}],"action":"","property":"","from":"","to":"","reg":false,"x":402.75877380371094,"y":307.30560302734375,"wires":[["db5e7dd6.6675a"]]},{"id":"8c35709.24b749","type":"multipart-decoder","z":"57188ccd.92d204","name":"","ret":"bin","url":"","tls":"","delay":0,"x":830,"y":259,"wires":[["835f29a7.efb048"]]}]
```
## Node properties
In the node config screen, a series of properties can be setup:

### URL
The URL should be an URL that responds with a multipart http stream (otherwise use the standard Node-Red http-request node).  This URL property is required, except when the URL is specified in the input message via `msg.url`.

The URL can contain <a href="http://mustache.github.io/mustache.5.html" target="_blank">mustache-style</a> tags. Using these tags, an URL can be constructed dynamically based on values of properties in the input message.  For example, if the url is set to:

```
    www.mycamera.be/{{{topic}}}/snapshot.cgi
```

Then the value of `msg.topic` will be automatically inserted in the placeholder.  Remark: by using tripple brackets {{{...}}}, mustache will stop escaping characters like / & ...

### SSL/TLS connection
Make use of configured TLS connections (in a common TLS configuration node), where you can provide paths to your certificate files. 

### Basic authentication
Apply your username and password for http requests that require user authentication.  This data will be stored outside the flow (i.e. in a flows_xxx_cred.json file instead of the normal flows_xxx.json file).  This way these credentials will not be shared with other users when a part of the flow is being exported.

Note that basic authentication can be used both for the http and https protocols.

### Output (format)
The output data in `msg.payload` can be formatted as UTF8 string, as JSON object, or as binary buffer.  Make sure to use binary buffer in case of images, i.e. when decoding an MJPEG stream.

### Delay
The delay is the (minimum) number of milliseconds between parts in a multipart stream, to allow throttling the stream.  By default the value `0` is applied, which means throttling is disabled (i.e. receiving the stream at full speed).

### Maximum size
Decoding a multipart stream, involves - among others - searching for a boundary between streams.  Suppose for some reason this boundary couldn't be found, which means the decoder would keep searching (and storing byte chunks in memory).  As a result the decoder would continue using more and more memory, until the whole system fails.  

To avoid this, the maximum number of bytes (that can be received) need to be specified.  When this number is exceeded, an error will be raised and the node stops decoding.  By default the maximum number of bytes has been set to 1.000.000 bytes.  Keep in mind that this number could be unsufficient e.g. when decoding high resolution image streams. 

Take into consideration that determination of this number is not exact science.  E.g. when you are retrieving images with resolution 640x480, it is not correct to set a limit of 640 * 480 = 307200 bytes.  Indeed:
+ Images are mostly *compressed* (e.g. JPEG format), which means the image size varies from image to image.
+ A single image is received as N data chunks, and the last chunk already contains a *part of the next* image.

### Block size (version 0.0.3 and above)
By default the block size is 1, which means the output `msg.payload` will contain a single part from the multipart stream.  E.g. for an MJPEG stream, every message will contain a single image buffer.

When a block size N is specified (with N > 1), the output `msg.payload` will contain an *array* of N parts from the multipart stream.  As soon as the decoder has received N parts, it will generate a single output message:

![Block](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_block.png)

This can be used in case the stream sends a massive amount of (small) parts.  For performance reasons, it might then be advisable to avoid generating a single output message for every part.  For example an audio stream will contain more than 40000 samples per second.

## Output message
For every part that has been decoded, an output message will be generated:
+ `msg.payload` : Is the body of the part, for example an image.
+ `msg.statusCode` : Is the status code of the response, or the error code if the request could not be completed.
+ `msg.responseUrl` : Is the url of the server that has responded.
+ `msg.content` : Contains the http headers of the current part.

## Performance
This decoder has been written in full Javascript, and has been rewritten a couple of times to use as less CPU and memory as possible.  During decoding, searching the boundary between two parts will consume the most CPU resources.  This searching process will be faster if the part headers contain a ***Content-Lenght*** header, which specifies the length of the part data.  However that Content-Lenght header is not mandatory in the multipart protocol, so not all devices will provide it...

To make sure your device stream contains Content-Length headers, you can check this in two different ways:
+ Check whether that header is available in the `msg.content` field of the output message:

     ![Msg.content](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_debug.png)

+ The node status icon will be a ***dot*** if the Content-Length header is available, or a ***ring*** when the header is absent:

     ![Msg.content](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_status.png)

## Combination with encoder
This decoder node could be used in combination with my [encoder node](https://github.com/bartbutenaers/node-red-contrib-multipart-stream-encoder).  When you want to display - in a dashboard - images at high speed, that cannot be accomplished using a single websocket channel.  To display the decoded images at high speed in a dashboard, the decode images could be encoded again to create a new MJPEG stream:

![Decode encode](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_decode_encode.png)

This example looks a bit useless, but normally extra processing will be executed on the images (between decoding and encoding): e.g. license plate recognition (using [node-red-contrib-openalpr-cloud](https://github.com/bartbutenaers/node-red-contrib-openalpr-cloud)), motion detection, ...
