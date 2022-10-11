const NodeHelper = require('node_helper');
const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = NodeHelper.create({
    start: function() {
        console.log('Starting node_helper for module [' + this.name + ']');
    },

    sendOffer: function(data) {
        const url = `http${data.config.https ? 's' : ''}://${data.config.host}:${data.config.port}/stream/${data.config.entity}/channel/0/webrtc`;
        const headers = {'Content-Type': 'application/x-www-form-urlencoded'};

        const formData = new FormData();
        formData.set('data', btoa(data.sdp));

        fetch(url, {method: 'POST', body: formData, headers})
            .then((response) => {
                if (response.ok) {
                    response.text().then((data) => this.sendSocketNotification('ANSWER', atob(data)));
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
