Module.register('MMM-go2rtc', {
    video: null,
    pc: null,
    stream: null,
    connectTimeout: null,

    defaults: {
        host: '127.0.0.1',
        port: '1984',
        https: false,
        width: '50%',
        entity: '',
    },

    start() {
        this._init();
    },

    getStyles() {
        return [this.name + '.css'];
    },

    getHeader: () => '',

    getDom() {
        if (this.stream) {
            this.video = document.createElement('video');
            this.video.classList.add('go2rtc-video');
            this.video.autoplay = true;
            this.video.controls = false;
            this.video.volume = 1;
            this.video.muted = true;
            this.video.style.maxWidth = this.config.width;
            this.video.playsInline = true;

            this.play();
            return this.video;
        }

        const error = document.createElement('div');
        error.classList.add('go2rtc-error', 'small');
        error.innerHTML = 'No data from Home Assistant';
        return error;
    },

    play() {
        const recover = () => {
            this.video.srcObject = this.stream;
            this.video.play();
        };

        this.video.onpause = recover;
        this.video.onstalled = recover;
        this.video.onerror = recover;

        recover();
    },

    stop() {
        this.video.onpause = null;
        this.video.onstalled = null;
        this.video.onerror = null;

        this.video.pause();
        this.video.srcObject = null;
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === 'DOM_OBJECTS_CREATED') {
            this.sendNotification('REGISTER_API', {
                module: this.name,
                path: 'go2rtc',
                actions: {
                    play: {
                        notification: 'GO2RTC_PLAY',
                        prettyName: 'Play Stream'
                    },
                    stop: {
                        notification: 'GO2RTC_STOP',
                        prettyName: 'Stop Stream'
                    },
                }
            });
        }

        if (notification === 'GO2RTC_PLAY') {
            this.play();
        }

        if (notification === 'GO2RTC_STOP') {
            this.stop();
        }
    },

    sendOffer(sdp) {
        this.sendSocketNotification('OFFER', {config: this.config, sdp});
    },

    socketNotificationReceived(notification, payload) {
        if (notification === 'ANSWER') {
            this._start(payload.sdp);
            this.updateDom();
        }
    },

    _startConnectTimer() {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = setTimeout(() => {
            this._connect();
        }, 1000);
    },

    _stopConnectTimer() {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
    },

    async _init() {
        this.stream = new MediaStream();
        this.pc = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302']
            }],
            iceCandidatePoolSize: 20
        });

        this.pc.onicecandidate = (e) => {
            if (!this.connectTimeout) {
                return;
            }
            this._startConnectTimer();
            if (e.candidate === null) {
                this._connect();
            }
        }

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === 'failed') {
                this.pc.close();
                this.video.srcObject = null;
                this._init();
            }
        }

        this.pc.ontrack = (event) => {
            this.stream.addTrack(event.track);
        }

        const pingChannel = this.pc.createDataChannel('ping');
        let intervalId;
        pingChannel.onopen = () => {
            intervalId = setInterval(() => {
                try {
                    pingChannel.send('ping');
                } catch (e) {
                    console.warn(e);
                }
            }, 1000);
        }
        pingChannel.onclose = () => {
            clearInterval(intervalId);
        }

        this.pc.addTransceiver('video', {'direction': 'recvonly'});

        this._startConnectTimer();
        const offer = await this.pc.createOffer({offerToReceiveVideo: true});
        return this.pc.setLocalDescription(offer);
    },

    _start(sdp) {
        try {
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp,
            });
            this.pc.setRemoteDescription(remoteDesc);
        } catch (e) {
            console.warn(e);
        }
    },

    async _connect() {
        this._stopConnectTimer();
        this.sendOffer(this.pc.localDescription.sdp);
    },
});
