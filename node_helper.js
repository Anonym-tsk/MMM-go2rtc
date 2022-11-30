const NodeHelper = require('node_helper');
const fetch = require('node-fetch');

const _btoa = (str) => {
    return Buffer.from(str, 'binary').toString('base64');
};

const _atob = (str) => {
    return Buffer.from(str, 'base64').toString('binary');
};

module.exports = NodeHelper.create({
    start: function() {
        console.log('Starting node_helper for module [' + this.name + ']');
    },

    sendOffer: function(data) {
        const url = `http${data.config.https ? 's' : ''}://${data.config.host}:${data.config.port}/stream/${data.config.entity}/channel/0/webrtc`;
        const headers = {'Content-Type': 'application/x-www-form-urlencoded'};
        const body = 'data=' + encodeURIComponent(_btoa(data.sdp));

        fetch(url, {method: 'POST', body, headers})
            .then((response) => {
                if (response.ok) {
                    response.text().then((data) => this.sendSocketNotification('ANSWER', {sdp: _atob(data)}));
                } else {
                    throw new Error('Response is not ok');
                }
            })
            .catch((error) => {
                console.error(this.name + ' ERROR:', error);
                setTimeout(() => this.sendOffer(data), 3000);
            });
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === 'OFFER') {
            this.sendOffer(payload);
        }
    }
});
