Module.register('MMM-go2rtc', {
    video: null,
    pc: null,
    ws: null,
    stream: null,
    connectTimeout: null,

    defaults: {
        host: '127.0.0.1',
        port: '1984',
        secure: false,
        width: '50%',
        src: '',
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
            this.video.srcObject = this.stream;

            const recover = () => {
                this.video.srcObject = this.stream;
                this.video.play();
            };
            this.video.onpause = recover;
            this.video.onstalled = recover;
            this.video.onerror = recover;
            return this.video;
        }

        const error = document.createElement('div');
        error.classList.add('go2rtc-error', 'small');
        error.innerHTML = 'No data from Home Assistant';
        return error;
    },

    _startConnectTimer() {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = setTimeout(() => {
            this._connect();
        }, 1000);
    },

    _stopConnectTimer() {
        // TODO: Что за таймер
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
    },

    _connectWs() {
        const wsUrl = `ws${this.config.secure ? 's' : ''}://${this.config.host}:${this.config.port}/api/ws?src=${this.config.src}`;

        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            this._stopConnectTimer();
            const msg = {type: 'webrtc/offer', value: this.pc.localDescription.sdp};
            this.ws.send(JSON.stringify(msg));
        };

        this.ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'webrtc/candidate') {
                    this.pc.addIceCandidate({candidate: msg.value, sdpMid: ''});
                } else if (msg.type === 'webrtc/answer') {
                    this.pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: msg.value}));
                    this.updateDom();
                }
            } catch (e) {}
        };
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
                this._connectWs();
            }
        }

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === 'failed') {
                this.pc.close();
                this.ws.close(1000);
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
});
