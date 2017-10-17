# node-red-contrib-multipart-stream-decoder
Node-Red node for decoding multipart streams over http

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-multipart-stream-decoder
```
## Usage
The goal is to decode a stream of data elements that arrive via http.  These elements can contain any kind of data (text, images, ...). One of the most known examples is an **MJPEG stream**, to receive continously JPEG images (like a video stream).  

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
[{"id":"4e26ec2f.eafc44","type":"inject","z":"57188ccd.92d204","name":"Street view full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":227,"y":240,"wires":[["2a8ba8db.fd6868"]]},{"id":"1b2955e4.3b40aa","type":"base64","z":"57188ccd.92d204","name":"Encode","x":860,"y":326,"wires":[["326b48d7.251718"]]},{"id":"326b48d7.251718","type":"throttle","z":"57188ccd.92d204","name":"Pass max 1/sec","throttleType":"time","timeLimit":"1","timeLimitType":"seconds","periodLimit":0,"periodLimitType":"seconds","countLimit":"10","blockSize":"1","locked":false,"resend":false,"x":1038,"y":326,"wires":[["b3eaa8e6.30f348"]]},{"id":"2a8ba8db.fd6868","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://mbewebcam.rhul.ac.uk/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":448.7093048095703,"y":240.0633544921875,"wires":[["f22d1e5d.39a67"]]},{"id":"3402ee0d.95b992","type":"inject","z":"57188ccd.92d204","name":"Radio station full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":229.0921173095703,"y":326.5555419921875,"wires":[["16715ce1.c74263"]]},{"id":"16715ce1.c74263","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://185.49.168.74:8001/axis-cgi/mjpg/video.cgi","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":450.80140686035156,"y":326.618896484375,"wires":[["f22d1e5d.39a67"]]},{"id":"14e7edce.6c4ec2","type":"comment","z":"57188ccd.92d204","name":"Camera with street view (resolution 704x576)","info":"","x":275.3382110595703,"y":203.692249417305,"wires":[]},{"id":"6e7fa5d4.14d17c","type":"comment","z":"57188ccd.92d204","name":"Camera at radio station (resolution 704x576)","info":"","x":270.0921173095703,"y":291.3055419921875,"wires":[]},{"id":"600e0de7.37b7c4","type":"inject","z":"57188ccd.92d204","name":"Pacific beach full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":223.3264923095703,"y":408.3055419921875,"wires":[["1e948121.0c6d5f"]]},{"id":"1e948121.0c6d5f","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://66.175.76.125/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":447.03578186035156,"y":408.368896484375,"wires":[["f22d1e5d.39a67"]]},{"id":"42acbf00.09032","type":"comment","z":"57188ccd.92d204","name":"Pacific beach hotel (resolution 1280x960)","info":"","x":257.3264923095703,"y":373.0555419921875,"wires":[]},{"id":"f22d1e5d.39a67","type":"multipart-decoder","z":"57188ccd.92d204","name":"","ret":"bin","url":"","tls":"","delay":0,"maximum":"9999999999","x":673,"y":326,"wires":[["1b2955e4.3b40aa"]]},{"id":"65af8973.8fda28","type":"inject","z":"57188ccd.92d204","name":"Beach","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":173.00001525878906,"y":494,"wires":[["23432d7d.a558c2"]]},{"id":"c9f2b48e.21e6b8","type":"comment","z":"57188ccd.92d204","name":"Beach (resolution 640x480)","info":"","x":207.00001525878906,"y":458.75,"wires":[]},{"id":"23432d7d.a558c2","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://200.36.58.250/mjpg/video.mjpg?resolution=640x480","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":450.00001525878906,"y":493,"wires":[["f22d1e5d.39a67"]]},{"id":"b3eaa8e6.30f348","type":"ui_template","z":"57188ccd.92d204","group":"1a7f6b0.0560695","name":"Show image","order":1,"width":"6","height":"6","format":"<img width=\"16\" height=\"16\" alt=\"mjpeg test...\" src=\"data:image/jpg;base64,{{msg.payload}}\" />\n","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":1224,"y":326,"wires":[[]]},{"id":"1a7f6b0.0560695","type":"ui_group","z":"","name":"Performance","tab":"18b10517.00400b","disp":true,"width":"6"},{"id":"18b10517.00400b","type":"ui_tab","z":"","name":"Performance","icon":"show_chart","order":5}]
```

Caution: this flow requires that node-red-contrib-throttle node is installed, to make sure that we don't overload the Node-Red websocket channel with too much images.

This decoder node does only support multipart streaming node.  If you need normal request/response behaviour, please use Node-Red's httprequest node.  In fact, this contribution was originally intended to be an extra [addition](https://github.com/node-red/node-red/pull/1227) of the http-request node.  As a result, some of the orginal code has been adopted here!

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

![Flow control](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_flow_throttle.png)

```
[{"id":"ee86d795.1e8cb8","type":"inject","z":"57188ccd.92d204","name":"Street view full speed","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":190,"y":260,"wires":[["db5e7dd6.6675a"]]},{"id":"db5e7dd6.6675a","type":"change","z":"57188ccd.92d204","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"http://mbewebcam.rhul.ac.uk/mjpg/video.mjpg","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":615.7093048095703,"y":259.0633544921875,"wires":[["8c35709.24b749"]]},{"id":"987b33a1.c7468","type":"inject","z":"57188ccd.92d204","name":"Street view max 2/sec","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":189.3264923095703,"y":353.2222900390625,"wires":[["4fb915bb.f1e59c"]]},{"id":"4fb915bb.f1e59c","type":"change","z":"57188ccd.92d204","name":"Throttle 0.5 secs","rules":[{"t":"set","p":"delay","pt":"msg","to":"500","tot":"num"}],"action":"","property":"","from":"","to":"","reg":false,"x":400.99314880371094,"y":353.22235107421875,"wires":[["db5e7dd6.6675a"]]},{"id":"835f29a7.efb048","type":"debug","z":"57188ccd.92d204","name":"Part headers (content)","active":true,"console":"false","complete":"content","x":1080,"y":260,"wires":[]},{"id":"1fd394ce.1969bb","type":"inject","z":"57188ccd.92d204","name":"Street view max 10/sec","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"x":190.0921173095703,"y":307.3055419921875,"wires":[["14a33ef5.687651"]]},{"id":"14a33ef5.687651","type":"change","z":"57188ccd.92d204","name":"Throttle 0.1 secs","rules":[{"t":"set","p":"delay","pt":"msg","to":"100","tot":"num"}],"action":"","property":"","from":"","to":"","reg":false,"x":402.75877380371094,"y":307.30560302734375,"wires":[["db5e7dd6.6675a"]]},{"id":"8c35709.24b749","type":"multipart-decoder","z":"57188ccd.92d204","name":"","ret":"bin","url":"","tls":"","delay":0,"x":830,"y":259,"wires":[["835f29a7.efb048"]]}]
```
## Node properties

TODO  !!!

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

⋅⋅⋅⋅⋅⋅![Msg.content](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_debug.png)

+ The node status icon will be a ***dot*** if the Content-Length header is available, or a ***ring*** when the header is absent:
⋅⋅⋅⋅⋅⋅![Msg.content](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_debug.png)

## Combination with encoder
This decoder node could be used in combination with my encoder node.  When you want to display - in a dashboard - images at high speed, that cannot be accomplished using a single websocket channel.  To display the decoded images at high speed in a dashboard, the decode images could be encoded again to create a new MJPEG stream:

![Decode encode](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_decode_encode.png)

This example looks a bit useless, but normally extra processing will be executed on the images (between decoding and encoding).
