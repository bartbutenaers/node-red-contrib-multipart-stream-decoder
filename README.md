# node-red-contrib-multipart-stream-decoder
Node-Red node for decoding multipart streams over http

+ Version ***0.0.2***: [Simon Hailes](https://github.com/btsimonh) has been testing version 0.0.1 thoroughly. 
+ Version ***1.0.0*** is a large refactoring of this node, to replace the obsolete [request](https://www.npmjs.com/package/request) library by [axios](https://www.npmjs.com/package/axios).  As a result, this node now supports ***digest authentication*** which is required by most of the modern IP cameras.

Note: the example flows in this readme page use url's of free public camera's, to allow you to test this node without having to have an IP camera that offers an MJPEG stream.  The disadvantage of this approach is that public camera's are often shut down, and as a result the example flows don't work anymore.  In that case, you can easily find new public MJPEG streams to test, using my step-by-step tutorial in [this](https://github.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/wiki/Find-a-public-mjpeg-stream-for-testing-flows) wiki page.

## Install

Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-multipart-stream-decoder
```

## Support my Node-RED developments
Please buy my wife a coffee to keep her happy, while I am busy developing Node-RED stuff for you ...

<a href="https://www.buymeacoffee.com/bartbutenaers" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy my wife a coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

## Streaming basics

The most known multipart stream type is the **MJPEG stream** (i.e. Motion Jpeg), which is used to get IP camera images at high speed.  Therefore this readme page will focus primarily on MJPEG streams.  Besides to MJPEG, lots of other multipart stream use cases exist.  In those use case, the parts in the stream can contain any kind of data (text, images, ...).   For example the Hikvision cameras offer multipart alert streams (see [manual](http://oversea-download.hikvision.com/uploadfile/Leaflet/ISAPI/HIKVISION%20ISAPI_2.0-IPMD%20Service.pdf) section 8.11.30) for continiously communicating all their statusses (pir, motion, ...) as XML strings.

+ When we execute a HTTP request (via a http-request node), the result will be a HTTP response containing the result data.  For example most cameras provide an URL that can be used to get a single ***snapshot image***.  However that mechanism isn't fast enough to get fluent video, due to the time delay between every request and response.  

+ To get images at higher rates, we will need to setup ***streaming***.  A stream is a single HTTP request, that results in an (in)finite HTTP response:

   ![Request response](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_reqresp.png)

   That continious response, are the parts (e.g. the images) separated by a *boundary* string (and headers containing info about a part/image):
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
   This decoder converts the continious stream into separate messages, whose payloads contain the part (e.g. the image):

   ![Image stream](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_decoder.png)
   
Nowadays more advanced streaming methods are available (e.g. fragmented mp4 streams over RTSP) compared to MJPEG, which offer better compression and higher frame rates.  However MJPEG streams can be interesting for example, when you want to do object detection on images.  Because no decoding is required to capture images from the MJPEG stream, while extracting images from other streaming technologies can be quite CPU intensitive.  Which is a problem on systems with limited resources, like e.g. on a Raspberry Pi...

## Usage

This decoder node can be used to get an infinite stream of images from the IP camera, simply by entering the MJPEG stream URL in the config screen. Use a trigger node to start the stream 'once':

![Stream url](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_stream_url.png)

### Example flow
The following example flow demonstrates how easy it is to stream images from a public IP camera, once you have entered the MJPEG stream url into the node's config screen:

![public_cam_demo](https://user-images.githubusercontent.com/14224149/207958962-ef497534-fa0d-4c15-af75-0fbbd4e7b04f.gif)
```
[{"id": "de38803771777170","type": "image","z": "8b52e098cd5f73fd","name": "","width": "600","data": "payload","dataType": "msg","svg": "svg","svgType": "msg","thumbnail": false,"active": true,"pass": false,"outputs": 0,"x": 740,"y": 2420,"wires": []},{"id": "4d0b39aca1632d3d","type": "multipart-decoder","z": "8b52e098cd5f73fd","name": "","ret": "bin","url": "http://208.65.20.237/mjpg/video.mjpg","tls": "","authentication": "none","delay": "","maximum": 1000000,"blockSize": 1,"credentials": {},"x": 490,"y": 2420,"wires": [["de38803771777170"],[]]},{"id": "fe72f0daefb67173","type": "inject","z": "8b52e098cd5f73fd","name": "Start stream","props": [{"p": "url","v": "http://192.168.1.41/cgi-bin/mjpg/video.cgi?channel=1&subtype=1","vt": "str"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 270,"y": 2520,"wires": [["4d0b39aca1632d3d"]]},{"id": "b949082f3b2bd80d","type": "inject","z": "8b52e098cd5f73fd","name": "Stop stream","props": [{"p": "stop","v": "true","vt": "bool"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 270,"y": 2560,"wires": [["4d0b39aca1632d3d"]]},{"id": "2f2af1e09fd48ff5","type": "inject","z": "8b52e098cd5f73fd","name": "Pause stream","props": [{"p": "pause","v": "true","vt": "bool"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 270,"y": 2420,"wires": [["4d0b39aca1632d3d"]]},{"id": "7897de8cc9babd66","type": "inject","z": "8b52e098cd5f73fd","name": "Resume stream","props": [{"p": "resume","v": "true","vt": "bool"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 260,"y": 2460,"wires": [["4d0b39aca1632d3d"]]}]
```

This flow requires that the wonderful [https://github.com/rikukissa/node-red-contrib-image-output](https://github.com/rikukissa/node-red-contrib-image-output) node is installed!
    
***CAUTION:*** In case of MJPEG streams the output type should be *Buffer*, to avoid that characters are being messed up resulting in invalid images ...

When you try a normal (non-streaming) URL in this node, you will get an error:
![No multipart URL](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_no_multipart.png)

### Stream control
A stream becomes active when a dummy message is injected, i.e. a message not containing one of the 3 below stream control properties.  As soon as the stream is active, it can be controlled using input messages:
+ `msg.stop` with value *true* to abort the current stream.
+ `msg.pause` with value *true* to pause the current stream temporarily.
+ `msg.resume` with value *true* to resume the current stream after it has been paused.  

Caution about this pause/resume mechanism:
+ There will be a **gap** in the data stream!  As soon as the current stream is paused, the sender (e.g. IP camera) will detect that we don't want to receive data anymore.  As a result the sender will stop streaming data temporarily.  As soon as the stream is resumed, the sender will restart streaming data: this is the current data (e.g. current camera snapshot image), and ***not*** the data from the moment of pausing.
+ When the *pause* request is executed, it will take some time until the sender detects that we don't want to receive data anymore.  This means that the sender will still send some data before pausing.  That data will be remembered but not processed immediately, since the request is paused.  As a result, **some old data** will be processed as soon as we resume the stream (before the new data is being processed).

Note that when a new input message is sent (containing an url), the active stream will be stopped and a new stream will be started.  And when the flow is (re)deployed, the active stream will be stopped automatically.

### Start a new stream
When a new input message is injected to start a new stream, then the old stream is automatically stopped first.  So it is ***not*** required to stop the current stream first, by injecting a stop message.

The input message can optionally contain an `msg.url` property, which allows you to switch from one stream to another.  The following example flow shows how to switch between the streams of two public ip camera's easily:

![switch_stream](https://user-images.githubusercontent.com/14224149/208249837-d37d2e08-01ca-4295-b613-4b4fab850567.gif)
```
[{"id": "ee86d795.1e8cb8","type": "inject","z": "8b52e098cd5f73fd","name": "First stream (Florida beach)","props": [{"p": "url","v": "http://208.65.20.237/mjpg/video.mjpg","vt": "str"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 260,"y": 3160,"wires": [["8c35709.24b749"]]},{"id": "8c35709.24b749","type": "multipart-decoder","z": "8b52e098cd5f73fd","name": "","ret": "bin","url": "","tls": "","authentication": "none","delay": 0,"maximum": "1000000","blockSize": "1","enableLog": "on","x": 570,"y": 3160,"wires": [["a47f8c9bfe0c0793"],[]]},{"id": "a47f8c9bfe0c0793","type": "image","z": "8b52e098cd5f73fd","name": "","width": "400","data": "payload","dataType": "msg","svg": "svg","svgType": "msg","thumbnail": false,"active": true,"pass": false,"outputs": 0,"x": 800,"y": 3160,"wires": []},{"id": "c6cf7a07de508770","type": "inject","z": "8b52e098cd5f73fd","name": "Second stream (Marktplatz Austria)","props": [{"p": "url","v": "http://cam1.rauris.net/axis-cgi/mjpg/video.cgi","vt": "str"}],"repeat": "","crontab": "","once": false,"onceDelay": 0.1,"topic": "","x": 280,"y": 3200,"wires": [["8c35709.24b749"]]}]
```

### Throttling speed
The speed of a stream depends on a series of independent factors:
+ The speed of the sender system (e.g. IP camera): the sender could send as data at full speed, but it could also throttle the data rate. E.g. a public camera stream could be limited to N images per second.
+ The speed of the communication between sender and the decoder node.
+ The speed at which this decoder node is able to process the data from the stream.

Suppose the sender speed is unlimited (e.g. a high quality IP camera) and your network has a very good bandwith.  This means that the decoder node could receive a large amount of images to process.  As a result the decoder node could receive much more images as required.  In such cases it is advised to ***throttle*** the incoming stream (to save both CPU and memory).  This could be accomplished in various ways:
+ Let the decoder node receive images at high speed, and filter out the unneeded messages afterwards in your flow (e.g. by using the node-red-contrib-throttle node).  However this way you will ***waste*** lots of resources (memory, CPU, bandwith, ...), by processing and filtering messages that will be thrown away...
+ Let the decoder node slowing down the stream, to make sure that only the required data is being received.  This can be accomplished by specifying the minimum **delay** value (in milliseconds) between parts in the stream.  In fact, the decoder node will pause the stream sometime between every part.

The following flow demonstrates to decode a stream at full speed, or throttle the stream to slow it down (via this node's delay option):

![image](https://user-images.githubusercontent.com/14224149/208249140-7a0b2509-b928-4ab5-b5a8-ff3bcc5f41c6.png)
```
[{"id": "ee86d795.1e8cb8","type": "inject","z": "8b52e098cd5f73fd","name": "Full speed (4/sec)","props": [{"p": "delay","v": "0","vt": "num"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 250,"y": 3160,"wires": [["8c35709.24b749"]]},{"id": "987b33a1.c7468","type": "inject","z": "8b52e098cd5f73fd","name": "Street view max 1/sec","props": [{"p": "delay","v": "1000","vt": "num"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 259.3264923095703,"y": 3253.2222900390625,"wires": [["8c35709.24b749"]]},{"id": "1fd394ce.1969bb","type": "inject","z": "8b52e098cd5f73fd","name": "Street view max 2/sec","props": [{"p": "payload"},{"p": "delay","v": "500","vt": "num"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","payload": "","payloadType": "date","x": 260.0921173095703,"y": 3207.3055419921875,"wires": [["8c35709.24b749"]]},{"id": "8c35709.24b749","type": "multipart-decoder","z": "8b52e098cd5f73fd","name": "","ret": "bin","url": "http://208.65.20.237/mjpg/video.mjpg","tls": "","authentication": "none","delay": 0,"maximum": "1000000","blockSize": "1","enableLog": "on","x": 530,"y": 3160,"wires": [["52b5166d3f225015"],[]]},{"id": "a47f8c9bfe0c0793","type": "image","z": "8b52e098cd5f73fd","name": "","width": "600","data": "payload","dataType": "msg","svg": "svg","svgType": "msg","thumbnail": false,"active": true,"pass": false,"outputs": 0,"x": 940,"y": 3160,"wires": []},{"id": "52b5166d3f225015","type": "msg-speed","z": "8b52e098cd5f73fd","name": "","frequency": "sec","interval": 1,"estimation": false,"ignore": false,"pauseAtStartup": false,"topicDependent": false,"x": 750,"y": 3160,"wires": [[],["a47f8c9bfe0c0793"]]},{"id": "94711142149d197a","type": "inject","z": "8b52e098cd5f73fd","name": "Stop stream","props": [{"p": "stop","v": "true","vt": "bool"}],"repeat": "","crontab": "","once": false,"onceDelay": "","topic": "","x": 290,"y": 3300,"wires": [["8c35709.24b749"]]}]
```
This flow requires that the [https://github.com/rikukissa/node-red-contrib-image-output](https://github.com/rikukissa/node-red-contrib-image-output) and the [node-red-contrib-msg-speed](https://github.com/bartbutenaers/node-red-contrib-msg-speed) nodes have been installed!

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

### Authenticate
Apply your username and password for http requests that require user authentication, in case basic or digest authentication is required to access a protected url.  These credentials will be stored outside the flow (i.e. in a flows_xxx_cred.json file instead of the normal flows_xxx.json file).  This way these credentials will not be shared with other users when a part of the flow is being exported.

Note that basic or digest authentication can be used both for the http and https protocols.

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
+ `msg.responseUrl` : Is the final redirected url of the server that has responded.
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

## Timeout (version 0.0.4 and above)
When a running stream is interrupted, an output message (with ```msg.payload``` containing *"Error: server not responding"*) will be generated after a timeout.  This can for example happen when the physical wire to the IP camera is disconnected.  The timeout period is required, because the link could be up-and-running again after some time.

Similar to other Node-RED nodes (e.g. HttpRequest ...), that timeout can be specified by uncommenting following lines in the settings.js file:
```
// Timeout in milliseconds for HTTP request connections
//  defaults to 120 seconds
//httpRequestTimeout: 120000,
```
When no value is specified here, a default timeout of 120 seconds will be used.
