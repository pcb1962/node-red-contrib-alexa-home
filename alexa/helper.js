
module.exports = {
    formatUUID: function (lightId) {
        if (lightId === null || lightId === undefined)
            return "";

        var string = ("" + lightId);
        return string.replace(".", "").trim();
    },
    formatHueBridgeUUID: function (lightId) {
        if (lightId === null || lightId === undefined)
            return "";
        var uuid = "f6543a06-da50-11ba-8d8f-";
        uuid += this.formatUUID(lightId);
        return uuid; // f6543a06-da50-11ba-8d8f-5ccf7f139f3d
    }
}