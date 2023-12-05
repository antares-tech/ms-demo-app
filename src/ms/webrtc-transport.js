import EventEmitter from 'eventemitter2';
import Log          from 'common/log';

const log = new Log ('webrtc-transport');

export default class WEBRTCTransport extends EventEmitter {
	#type
	#room
	#transport
	#statsInterval

	static Types = {
		Sender : 'sender',
		Recver : 'recver'
	};

	static Events = {
		New             : 'room/transport/new',
		Producing       : 'room/transport/producing',
		ProducingData   : 'room/transport/producingdata',
		IceGatherState  : 'room/transport/icegatheringstatechange',
		ConnectionState : 'room/transport/connectionstatechange',
		Stats           : 'room/transport/stats',
	};

	static async create (Transport, opts) {
		const { statsInterval } = opts;

		const transportInfo = await Transport.session.request (
			/* REQ ID         */    'createWebRtcTransport',
			/* DATA           */    {
				forceTcp         : Transport.room.forceTcp,
				producing        : Transport.type === this.Types.Sender,
				consuming        : Transport.type === this.Types.Recver,
				sctpCapabilities : Transport.room.useDataChannel && Transport.room.device.sctpCapabilities,
			},
			/* TO COMPONENT   */    'core',
			/* FROM COMPONENT */    null,
		);

		const transportInstance = Transport._createLocal (transportInfo, opts);

		Transport.transport     = transportInstance;
		Transport.statsInterval = statsInterval;

		Transport._addEventHandlers ();

		return Transport;
	}

	constructor (room, type) {
		super ({
			pastEvents: {
				windowSize : 10,
			}
		});

		this.#room = room;
		this.#type = type;
	}

	get id ()      { return this.#transport.id; }
	get type ()    { return this.#type; }
	get room ()    { return this.#room; }
	get session () { return this.#room.session; }

	set transport (t) { this.#transport = t; }
	get transport ()  { return this.#transport; }

	produce (opts) { return this.#transport.produce (opts); }
	consume (opts) { return this.#transport.consume (opts); }

	set statsInterval (t) { this.#statsInterval = t; }

	close ()         { this.#transport.close (); }

	on (fqEvent, handler) {
		this.#transport.on (fqEvent, (data) => {
			handler ({
				...data,
				id   : this.#transport.id,
				type : this.#type,
			});
		});
	}

	toJSON () {
		return {
			id                : this.#transport.id,
			direction         : this.#transport.direction,
			iceGatheringState : this.#transport.iceGatheringState,
			connectionState   : this.#transport.connectionState,
			appData           : this.#transport.appData,
			closed            : this.#transport.closed,
			type              : this.#type,
			statsInterval     : this.#statsInterval,
		};
	}

	_createLocal (transportInfo) {
		throw new Error ('child class needs to implement this');
	}

	_addEventHandlers () {
		this.#transport.on ('connect',                 this.#evConnect.bind (this));
		this.#transport.on ('produce',                 this.#evProduce.bind (this));
		this.#transport.on ('producedata',             this.#evProduceData.bind (this));
		this.#transport.on ('icegatheringstatechange', (data) => this.#transport.emit (WEBRTCTransport.Events.IceGatherState,  { iceGatheringState : data }));
		this.#transport.on ('connectionstatechange',   (data) => this.#transport.emit (WEBRTCTransport.Events.ConnectionState, { connectionState : data }));
		this.#transport.observer.on ('close',          (data) => this.#transport.emit (WEBRTCTransport.Events.ConnectionState, { connectionState : 'closed' }));
	}

	async #evConnect ({ dtlsParameters }, callback, errback) {
		try {
			const response = await this.#room.session.request (
				/* REQ ID         */    'connectWebRtcTransport',
				/* DATA           */    {
					id : this.#transport.id,
					dtlsParameters
				},
				/* TO COMPONENT   */    'core',
				/* FROM COMPONENT */    null,
			);

			if (this.#statsInterval)
				setInterval (() => this.#getStats (), this.#statsInterval);

			callback (response);
		}
		catch (err) {
			log.error ({ ev: 'connect', err }, 'WebRtcTransport: event handling failed')
			errback (err);
		}
	}

	async #getStats () {
		const report = await this.#transport.getStats ();

		this.#transport.emit (WEBRTCTransport.Events.Stats, { report });
	}

	async #evProduce ({ kind, rtpParameters, appData }, callback, errback)  {
		try {
			const response = await this.#room.session.request (
				/* REQ ID         */    'produce',
				/* DATA           */    {
					id : this.#transport.id,
					kind,
					rtpParameters,
					appData
				},
				/* TO COMPONENT   */   'core',
				/* FROM COMPONENT */   null
			);

			this.#transport.emit (WEBRTCTransport.Producing, response);

			callback ({ id: response.id });
		}
		catch (err) {
			log.error ({ ev: 'produce', err }, 'WebRtcTransport: event handling failed')
			errback (err);
		}
	}

	async #evProduceData (
		{
			sctpStreamParameters,
			label,
			protocol,
			appData
		},
		callback,
		errback
	)  {
		try {
			const response = await this.#room.session.request (
				/* REQ ID         */    'produceData',
				/* DATA           */    {
					transportId : this.#transport.id,
					sctpStreamParameters,
					label,
					protocol,
					appData
				},
				/* TO COMPONENT   */   'core',
				/* FROM COMPONENT */   null
			);

			this.#transport.emit (WEBRTCTransport.ProducingData, response);

			callback ({ id: response.id });
		}
		catch (err) {
			log.error ({ ev: 'producedata', err }, 'WebRtcTransport: event handling failed')
			errback (err);
		}
	}
}
