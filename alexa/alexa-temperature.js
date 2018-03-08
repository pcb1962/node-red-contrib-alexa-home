const utils = require('util');
var homeNode = require('./alexa-home');

function AlexaTemperatureNode(config) {
    homeNode.AlexaHomeNode.call(this, config);
}

utils.inherits(AlexaTemperatureNode, homeNode.AlexaHomeNode);

AlexaTemperatureNode.prototype.handleEvent = function (msg) {
    var node = this;
    if (msg == null || msg.payload === null || msg.payload === undefined) {
        node.status({
            fill: "red",
            shape: "dot",
            text: "invalid payload received"
        });
        return;
    }

    node.status({
        fill: "green",
        shape: "dot",
        text: "temperature: " + msg.payload
    })

}


module.exports = { AlexaTemperatureNode: AlexaTemperatureNode };