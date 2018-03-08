//import { request } from 'https';

const httpGraceTime = 500;
var helper = require('./helper');

function AlexaHomeController(config) {

    global.RED.nodes.createNode(this, config);
    var node = this;
    node.id = config.id
    node.port = config.port;
    node.name = config.deviceName;
    node.active = true;
    node._commands = {};
    node.nodeCount = 0;

    var stoppable = require('stoppable');
    var http = require('http');
    node.httpServer = stoppable(http.createServer(function (request, response) {
        node.handleHueApiRequestFunction(request, response);
    }), httpGraceTime);

    node.httpServer.on('error', function (error) {
        if (!error) {
            node.setConnectionStatusMsg("red", "unable to start [0] (p:" + node.port + ")")
            return;
        }

        var errorCode = null;
        if (error.code) errorCode = error.code;
        else if (error.errno) errorCode = error.errno;

        var errorText = "";
        if (errorCode) errorText += errorCode;
        else errorText += "unable to start [1]";
        errorText += " (p:" + node.port + ")";
        node.setConnectionStatusMsg("red", errorText, "ring");
        node.error(error);
    });

    node.httpServer.listen(node.port, function (error) {
        if (error) {
            node.setConnectionStatusMsg("red", "unable to start [2] (p:" + node.port + ")", "ring");
            console.error(error);
            return;
        }

        //Start discovery service after we know the port number
        node.startSSDP();
    });

    node.on('close', function (removed, doneFunction) {
        if (removed) {
            /// FIXXME clean _commands
        }
        node.httpServer.stop(function () {
            if (typeof doneFunction === 'function')
                doneFunction();
        });
        setImmediate(function () {
            node.httpServer.emit('close');
        });
    });
}
AlexaHomeController.prototype.registerCommand = function (deviceNode) {
    // console.log("registering: " + deviceNode.name);
    this._commands[helper.formatUUID(deviceNode.id)] = deviceNode;
    this.nodeCount += 1;
}

AlexaHomeController.prototype.deregisterCommand = function (deviceNode) {
    delete this._commands[helper.formatUUID(deviceNode.id)]
    this.nodeCount -= 1;
}

AlexaHomeController.prototype.startSSDP = function () {

    var node = this;
    if (node.port === null || node.port === undefined || node.port <= 0 || node.port >= 65536) {
        var errorMsg = "port is in valid (" + node.port + ")";
        this.status({
            fill: "red",
            shape: "ring",
            text: errorMsg
        });
        console.error(errorMsg);
        return;
    }

    var ssdp = require("peer-ssdp");
    var peer = ssdp.createPeer();
    peer.on("ready", function () {});
    peer.on("notify", function (headers, address) {});
    peer.on("search", function (headers, address) {
        // console.log("SEARCH: ", headers, address);
        var isValid = headers.ST && headers.MAN == '"ssdp:discover"';
        if (!isValid)
            return;

        var uuid = helper.formatUUID(node.id);
        var hueuuid = helper.formatHueBridgeUUID(node.id);

        peer.reply({
            ST: "urn:schemas-upnp-org:device:basic:1",
            SERVER: "Linux/3.14.0 UPnP/1.0 IpBridge/1.17.0",
            EXT: "",
            USN: "uuid:" + hueuuid,
            "hue-bridgeid": uuid,
            LOCATION: "http://{{networkInterfaceAddress}}:" + node.port + "/upnp/amazon-ha-bridge/setup.xml",
        }, address);
    });
    peer.on("found", function (headers, address) {});
    peer.on("close", function () {});
    peer.start();
}

AlexaHomeController.prototype.generateControllerConfig = function (itemType) {
    var keys = Object.keys(this._commands);
    var itemCount = keys.length;
    var data = '{ "' + itemType + '": { ';
    for (var i = 0; i < itemCount; ++i) {
        var uuid = keys[i];
        var childNode = this._commands[uuid];
        if(childNode instanceof AlexaHomeNode && itemType !== "lights")
            continue;
        if(childNode instanceof AlexaTemperatureNode && itemType !== "sensors")
            continue;

        data += '"' + uuid + '": ' + this.generateCommandConfig(uuid, childNode);
    }
    data = data.substr(0, data.length -1) + " } }";
    return data;
}
AlexaHomeController.prototype.generateCommandConfig = function (uuid, node) {
    // console.log("node: ", node);
    var state = null;
    if (state === undefined || state === null)
        state = "true";
    else
        state = state ? "true" : "false";

    var fullResponseString = '{"state": ' +
        '{"on": ' + state + ', "bri": ' + bri_default + ',' +
        ' "hue": 15823, "sat": 88, "effect": "none", ' +
        '"alert": "none", "colormode": "ct", "ct": 365, "reachable": true, ' +
        '"xy": [0.4255, 0.3998]}, "type": "Extended color light", ' +
        '"name": "' + node.name + '", ' +
        '"modelid": "LCT004", "manufacturername": "Philips", ' +
        '"uniqueid": "' + uuid + '", ' +
        '"swversion": "65003148", ' +
        '"pointsymbol": {"1": "none", "2": "none", "3": "none", "4": "none", "5": "none", "6": "none", "7": "none", "8": "none"}' +
        '}';

    return fullResponseString;
}

AlexaHomeController.prototype.generateBridgeSetupXml = function (lightId, deviceName) {

    //IP Address of this local machine
    var ip = require("ip").address();

    //Unique UUID for each bridge device
    var uuid = helper.formatUUID(lightId);
    var bridgeUUID = helper.formatHueBridgeUUID(lightId);

    //Load setup.xml & replace dynamic values
    var fs = require('fs');
    var setupXml = fs.readFileSync(__dirname + '/setup.xml');
    setupXml = setupXml.toString();
    setupXml = setupXml.replace("IP_ADDRESS_WITH_PORT", ip + ":" + this.port);
    setupXml = setupXml.replace("UUID_UUID_UUID", bridgeUUID);

    return setupXml;
}

AlexaHomeController.prototype.controlSingleLight = function (lightMatch, request, response) {

    var token = lightMatch[1];
    var uuid = lightMatch[2];
    uuid = helper.replace("/", "");
    if(this._commands[uuid] === undefined) {
        global.RED.log.warn("unknown alexa node was requested: " + uuid)
        return
    }

    // console.log("lightMatch: " + token + "|" + uuid);
    var node = this;
    if (request.method == 'PUT') {
        request.on('data', function (chunk) {
            // console.log("Receiving PUT data ", chunk.toString());
            request.data = JSON.parse(chunk);
        });
        request.on('end', function () {
            node.handleAlexaDeviceRequestFunction(request, response, uuid);
        });
    } else {
        // console.log("Sending light " + uuid + " to " + request.connection.remoteAddress);
        var targetNode = this._commands[uuid];
        var lightJson = this.generateCommandConfig(uuid, targetNode);
        response.writeHead(200, {
            'Content-Type': 'application/json'
        });
        response.end(lightJson);
    }
}
AlexaHomeController.prototype.handleHueApiRequestFunction = function (request, response) {

    var node = this;
    var lightId = helper.formatUUID(node.id);
    var lightMatch = /^\/api\/(\w*)\/lights\/([\w\-]*)/.exec(request.url);
//        var sensorsMatch = /^\/api\/(\w*)\/sensors\/([\w\-]*)/.exec(request.url);
    var authMatch = /^\/api\/(\w*)/.exec(request.url) && (request.method == 'POST');

    //Debug
    // console.log(node.port, request.method, request.url, request.connection.remoteAddress);

    //Control 1 single light
    if (lightMatch) {
        this.controlSingleLight(lightMatch, request, response)
    } else if (authMatch) {
        var responseStr = '[{"success":{"username":"' + HUE_USERNAME + '"}}]';
        console.log("Sending response to " + request.connection.remoteAddress, responseStr);
        this.setConnectionStatusMsg("blue", "auth (p: " + node.port + ")")
        response.writeHead(200, "OK", {
            'Content-Type': 'application/json'
        });
        response.end(responseStr);
    } else if (/^\/api\/lights/.exec(request.url)) {
        console.log("Sending all lights json to " + request.connection.remoteAddress);
        this.setConnectionStatusMsg("yellow", "/lights (p:" + node.port + ")");
        var allLightsConfig = this.generateControllerConfig("lights");
        response.writeHead(200, {
            'Content-Type': 'application/json'
        });
        response.end(allLightsConfig);
    } else if (/^\/api\/sensors/.exec(request.url)) {
        console.log("Sending all sensors json to " + request.connection.remoteAddress);
        var allSensorsConfig = this.generateControllerConfig("sensors");
        response.writeHead(200, {
            'Content-Type': 'application/json'
        });
        response.end(allSensorsConfig);
    } else if (request.url == '/upnp/amazon-ha-bridge/setup.xml') {
        console.log("Sending setup.xml to " + request.connection.remoteAddress);
        this.setConnectionStatusMsg("yellow", "discovery (p: " + node.port + ")")
        var rawXml = this.generateBridgeSetupXml(lightId, node.name);
        console.log("xml", rawXml);
        response.writeHead(200, {
            'Content-Type': 'application/xml'
        });
        response.end(rawXml);
    }
}

AlexaHomeController.prototype.setConnectionStatusMsg = function (color, text, shape) {
    shape = shape || 'dot';
    var newState = function (item) {
        item.status({
            fill: color,
            shape: shape,
            text: text
        });
    };
    var keys = Object.keys(this._commands);
    var node = this;
    keys.forEach(function (key) {
        newState(node._commands[key]);
    });
}

AlexaHomeController.prototype.handleAlexaDeviceRequestFunction = function (request, response, uuid) {
    if (request === null || request === undefined || request.data === null || request.data === undefined) {
        this.setConnectionStatusMsg("red", "Invalid request")
        global.RED.log.error("Invalid request");
        return;
    }
    var alexa_ip = request.headers['x-forwarded-for'] || 
                 request.connection.remoteAddress || 
                 request.socket.remoteAddress ||
                 request.connection.socket.remoteAddress;

    //Use the json from Alexa as the base for our msg
    var msg = request.data;
    // console.log("Got request " + this.id + " for " + uuid + ": " + msg);
    //Differentiate between on/off and dimming command. Issue #24
    var isOnOffCommand = (msg.on !== undefined && msg.on !== null) && (msg.bri === undefined || msg.bri === null);
    msg.on_off_command = isOnOffCommand;

    //Add extra 'payload' parameter which if either "on" or "off"
    var onoff = "off";
    if (request.data.on) //true/false
        onoff = "on";
    msg.payload = onoff;
    msg.alexa_ip = alexa_ip;
    this.justDoIt(uuid, msg);

    //Response to Alexa
    var responseStr = '[{"success":{"/lights/' + uuid + '/state/on":true}}]';
    // console.log("Sending response to " + request.connection.remoteAddress, responseStr);
    response.writeHead(200, "OK", {
        'Content-Type': 'application/json'
    });
    response.end(responseStr);
}

module.exports = { AlexaHomeController: AlexaHomeController};