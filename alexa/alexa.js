var controller = require('./alexa-controller');
var homeNode = require('./alexa-home');
var tempNode =require('./alexa-temperature');

global.RED = undefined;

module.exports = function (RED) {

    RED.nodes.registerType("alexa-home-controller", controller.AlexaHomeController)
    RED.nodes.registerType("alexa-home", homeNode.AlexaHomeNode);
    RED.nodes.registerType("alexa-temperature", tempNode.AlexaTemperatureNode);


    global.RED = RED
}

