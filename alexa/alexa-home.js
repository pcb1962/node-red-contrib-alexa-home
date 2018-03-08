const HUE_USERNAME = "1028d66426293e821ecfd9ef1a0731df";
const maximumNodeCount = 25;
const httpDefaultPort = process.env.ALEXA_PORT || 60000;
const bri_default = process.env.BRI_DEFAULT || 126;
const bri_step = 25;
const utils = require('util');

const storage = require('node-persist');
var controller = require('./alexa-controller');
var helper = require('./helper');

function AlexaHomeNode(config) {

    global.RED.nodes.createNode(this, config);

    storage.initSync({
        dir: global.RED.settings.userDir + '/alexa-home'
    });

    var node = this;
    node.id = config.id;
    node.state = config.state;
    node.control = config.control;
    node.name = config.devicename;
    node.inputtrigger = config.inputtrigger;
    node.controller = node.findAlexaHomeController();

    if (!node.controller) {
        global.RED.log.error(node.name + " - Could not get a Alexa Home Controller - node is not functional!")
        node.status("red", "No Alexa Home Controller")
        return;
    }

    node.persistControllerPort();
    node.controller.registerCommand(node);
    node.on('close', function (done) {
        if (node.controller) {
            node.controller.deregisterCommand(node);
        }
        done();
    })

    node.on('input', function (msg) {
        node.handleEvent(msg);
    });

    node.status({
        fill: "green",
        shape: "dot",
        text: "online (p:" + node.controller.port + ")"
    });
}

AlexaHomeNode.prototype.handleEvent = function ( msg) {

    if (msg == null || msg.payload === null || msg.payload === undefined) {
        node.status({
            fill: "red",
            shape: "dot",
            text: "invalid payload received"
        });
        return;
    }

    var lightId = helper.formatUUID(node.id);
    var isOnOffCommand = false;

    var briInput = 0;
    msg.payload = "" + msg.payload;
    msg.payload = msg.payload.trim().toLowerCase();
    if (msg.payload === "toggle") {
        isOnOffCommand = true;
    } else if (msg.payload === "on") {
        msg.payload = "on";
        briInput = 100;
        isOnOffCommand = true;
    } else if (msg.payload === "off") {
        msg.payload = "off";
        briInput = 0;
        isOnOffCommand = true;
    } else {
        briInput = Math.round(parseFloat(msg.payload));
        msg.bri = Math.round(parseFloat(msg.payload) / 100.0 * 255.0);
        msg.payload = (msg.bri > 0) ? "on" : "off";
        isOnOffCommand = false;
    }

    msg.on_off_command = isOnOffCommand;

    //Check if we want to trigger the node
    var inputTrigger = false;
    if (node.inputtrigger)
        inputTrigger = node.inputtrigger;
    if (inputTrigger) {
        node.justDoIt(lightId, msg);
        return;
    }

    //No trigger, simply update the internal 'bri' value
    var bri = Math.round(briInput / 100.0 * 255.0);
    /// FIXXME setLightBriForLightId(lightId, bri);
    node.status({
        fill: "blue",
        shape: "dot",
        text: "updated bri:" + briInput
    });
}

AlexaHomeNode.prototype.justDoIt = function (uuid, msg) {
    //Node parameters
    var targetNode = this;
    var deviceName = targetNode.name;

    //Detect increase/decrease command
    msg.change_direction = 0;
    if (msg.bri && msg.bri == bri_default - 64) //magic number
        msg.change_direction = -1;
    if (msg.bri && msg.bri == bri_default + 63) //magic number
        msg.change_direction = 1;

    /// FIXXME
    //Toggle command
    //if (msg.payload === "toggle") {
    //    var state = getLightStateForLightId(uuid);
    //    var isOn = !state;
    //    msg.payload = isOn ? "on" : "off";
    //}

    //Dimming or Temperature command
    if (msg.bri) {
        //Save the last value (raw value)
        /// FIXXME setLightBriForLightId(uuid, msg.bri);

        msg.bri = Math.round(msg.bri / 255.0 * 100.0);
        msg.bri_normalized = msg.bri / 100.0;
        msg.on = msg.bri > 0;
        msg.payload = msg.on ? "on" : "off";

        //Save the last state value
        // setLightStateForLightId(uuid, msg.on);

        //Node status
        targetNode.status({
            fill: "blue",
            shape: "dot",
            text: "bri:" + msg.bri + " (p:" + httpPort + ")"
        });
    }
    //On/off command
    else {
        var isOn = (msg.payload == "on")
        msg.bri = isOn ? 100 : 0;
        msg.bri_normalized = isOn ? 1.0 : 0.0;

        //Save the last state value
        /// FIXXME setLightStateForLightId(uuid, isOn);

        //Restore the previous value before off command
        var savedBri = bri_default; // getLightBriForLightId(uuid);
        if (isOn) {
            if (savedBri && savedBri > 0) {
                msg.bri = Math.round(savedBri / 255.0 * 100.0);
                msg.bri_normalized = msg.bri / 100.0;
            }
        }
        //Output the saved bri value for troubleshooting
        else {
            if (savedBri) {
                msg.saved_bri = Math.round(savedBri / 255.0 * 100.0);
                msg.save_bri_normalized = msg.saved_bri / 100.0;
            }
        }

        //Node status
        targetNode.status({
            fill: "blue",
            shape: "dot",
            text: "" + msg.payload + " (p:" + httpPort + ")"
        });
    }

    //Add extra device parameters
    msg.device_name = deviceName;
    msg.light_id = uuid;

    //Send the message to next node
    targetNode.send(msg);
}

AlexaHomeNode.prototype.persistControllerPort = function () {
    if (!storage)
        return

    storage.setItemSync(this.id, this.controller.port);
}

AlexaHomeNode.prototype.loadControllerPort = function () {
    var port = undefined;
    if (storage) {
        port = storage.getItemSync(this.id);
    }
    if (port === null) {
        port = undefined;
    }

    return port
}

AlexaHomeNode.prototype.findAlexaHomeController = function () {

    var persistedPort = this.loadControllerPort();

    var globalContext = this.context().global;
    var controllerList = [];
    var lastController = null;
    if (globalContext.get("alexa-home-controller") !== null && globalContext.get("alexa-home-controller") !== undefined) {
        controllerList = globalContext.get("alexa-home-controller");
        for (var i = 0; i < controllerList.length; ++i) {
            lastController = controllerList[i];
            if (controllerList[i].nodeCount < maximumNodeCount) {
                if (persistedPort === undefined || persistedPort === controllerList[i].port)
                    return controllerList[i];
            }
        }
    }
    var port = httpDefaultPort;
    if (persistedPort !== undefined) {
        port = persistedPort;
    } else if (lastController !== null) {
        port = lastController.port + 1;
    }
    var controllerId = this.loadControllerId(port);
    if (controllerId === undefined)
        controllerId = global.RED.util.generateId()

    var controllerConfig = {
        id: controllerId,
        type: 'alexa-home-controller',
        z: '',
        name: port,
        port: port
    }
    var createdController = new controller.AlexaHomeController(controllerConfig);
    controllerList.push(createdController);
    globalContext.set("alexa-home-controller", controllerList)
    this.persistControllerId(port, controllerConfig.id);
    return createdController;
}
AlexaHomeNode.prototype.persistControllerId = function (port, id) {
    if (!storage)
        return

    storage.setItemSync(port.toString(), id)
}

AlexaHomeNode.prototype.loadControllerId = function (port) {
    var cid = undefined;
    if (storage && port !== undefined) {
        cid = storage.getItemSync(port.toString());
    }
    if (cid == null)
        cid = undefined;

    return cid
}

module.exports = { AlexaHomeNode: AlexaHomeNode };