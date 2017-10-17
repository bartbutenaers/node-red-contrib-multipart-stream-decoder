# node-red-contrib-multipart-stream-decoder
Node-Red node for decoding multipart streams over http

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-multipart-stream-decoder
```
## Usage
The goal is to decode a stream of data elements that arrive via http.  These elements can create any kind of data (text, images, ...). One of the most known examples is an **MJPEG stream**, to receive continously JPEG images (like a video stream).  

***The decoder converts a continious stream into separate messages, whose payloads contain the received data.***  For example converting a continous MJPEG stream (from a camera) into separate images:

![Stream decoder](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_decoder.png)

However - besides to MJPEG - lots of other multipart stream use cases exist.  For example the Hikvision cameras offer multipart alert streams (see [manual](http://oversea-download.hikvision.com/uploadfile/Leaflet/ISAPI/HIKVISION%20ISAPI_2.0-IPMD%20Service.pdf) section 8.11.30) for continiously communicating all their statusses (pir, motion, ...) as XML strings.

## Streaming basics
When we execute a HTTP request we will get a HTTP response containing the result data.  For example every camera provides an URL that can be used to get a single snapshot image.  This mechanism isn't fast enough to get fluent video, due to the time interval between every request and response.

To get images very fast, we will need to setup streaming.  When we execute a single HTTP request we will get an (in)finite HTTP response:

![Request response](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-multipart-stream-decoder/master/images/stream_reqresp.png)

For example every camera will provide an URL for MJPEG streaming.  

This way the response has become endless (with a *boundary* string as separator between images):
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

TODO add test flow

## Stream control
As soon as a stream is active, that stream can be controlled using input messages:
+ `msg.stop` with value *true* to abort the current stream.
+ `msg.pause` with value *true* to pause the current stream temporarily.
+ `msg.resume` with value *true* to resume the current stream after it has been paused.  

Caution about the pause/resume mechanism:
+ There will be a **gap** in the data stream!  As soon as the current stream is paused, the client system (e.g. IP camera) will detect that we don't want to receive data anymore.  As a result the client will stop streaming data temporarily.  As soon as the stream is resumed, the client will restart streaming data: this is the current data (e.g. current camera snapshot image), and ***not*** the data from the moment of pausing.
+ When the *pause* request is executed, it will take some time until the client detects that we don't want to receive data anymore.  This means that the client will still send some data before pausing.  That data will be buffered (in the paused NodeJ's request) but not processed since the request is paused.  As a result, **some old data** will be processed as soon as we resume the stream (before the new data is being processed).

Note that when a new input message is sent (containing an url), the active stream will be stopped and a new stream will be started.

TODO add test flow

## Throttling speed
The speed of a stream depends on a series of independent factors:
+ The speed that the data is being sended by the client system (e.g. IP camera): the client could send as data at full speed, but it could als throttle the data rate. E.g. a public camera stream could be limited to N images per second.
+ The speed of the communication between client and server.
+ The speed at which this decoder node is able to process the data from the stream.

Suppose the client is unlimited (e.g. a high quality IP camera) and your network has a very good bandwith, so the decoder node could get a large amount of images to process.  So it could be that you receive much more images as required.  In such cases it is advised to throttle the incoming stream (to save both CPU and memory).  This could be accomplished in various ways:
+ Let the decoder node receive images at high speed, and filter out the unneeded messages afterwards in your flow (e.g. by using the node-red-contrib-throttle node).  However this way you will ***waste*** lots of resources (memory, CPU, bandwith, ...), by processing and filtering messages that will be thrown away...
+ Let the decoder node slowing down the stream, to make sure that only the required data is being received.  This can be accomplished by specifying the minimum **delay** value (in milliseconds) between parts in the stream.  That way the decoder node will pause the stream sometime between every part.

TODO add test flow

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

+ The node status icon will be a ***dot*** if the Content-Length header is available, or a ***ring*** when the header is abscent:
TODO: add image

