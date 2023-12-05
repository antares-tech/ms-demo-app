import * as e2e        from 'ms/e2e';
import Log             from 'common/log';
import WEBRTCTransport from './webrtc-transport';

const log = new Log ('recv-transport');

export default class RecvTransport extends WEBRTCTransport {

	static async create (room, opts = {}) {
		const Transport = new RecvTransport (room, WEBRTCTransport.Types.Recver);

		return super.create (Transport, opts);
	}

	_createLocal (transportInfo, opts) {
		const { appData } = opts;

		const {
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters
		} = transportInfo;

		const transport = this.room.mediasoupDevice.createRecvTransport ({
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters :
			{
				...dtlsParameters,
				// Remote DTLS role. We know it's always 'auto' by default so, if
				// we want, we can force local WebRTC transport to be 'client' by
				// indicating 'server' here and vice-versa.
				role : 'auto'
			},
			sctpParameters,
			iceServers             : [],
			additionalSettings 	   : { encodedInsertableStreams: this.room.e2eKey && e2e.isSupported() },
			appData,
		});

		log.debug (`RECV WEBRTC transport created (id="${id}")`);
		return transport;
	}

}
