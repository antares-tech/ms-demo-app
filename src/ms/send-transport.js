import * as e2e        from 'ms/e2e';
import Log             from 'common/log';
import WEBRTCTransport from './webrtc-transport';

const log = new Log ('send-transport');
const PC_PROPRIETARY_CONSTRAINTS = {
	// optional : [ { googDscp: true } ]
};

export default class SendTransport extends WEBRTCTransport {

	static async create (room, opts = {}) {
		const Transport = new SendTransport (room, WEBRTCTransport.Types.Sender);

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

		const transport = this.room.mediasoupDevice.createSendTransport ({
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
			proprietaryConstraints : PC_PROPRIETARY_CONSTRAINTS,
			additionalSettings 	   : { encodedInsertableStreams: this.room.e2eKey && e2e.isSupported() },
			appData,
		});

		log.debug (`SEND WEBRTC transport created (id="${id}")`);
		return transport;
	}

}
