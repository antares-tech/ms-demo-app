import EventEmitterX        from 'common/eventemitterx';
import * as mediasoupClient from 'mediasoup-client';
import Log                  from 'common/log';
import UserAgentDevice      from 'common/user-agent';
import WebRtcTransport      from './webrtc-transport';
import SendTransport        from './send-transport';
import RecvTransport        from './recv-transport';

const log = new Log ('room');

export default class Room extends EventEmitterX {
	#session;
	#id;
	#url;
	#userAgentDevice
	#state
	#mediasoupDevice
	#sender
	#recver
	#canProduce
	#canConsume
	#useDataChannel
	#producers = new Map ();
	#consumers = new Map ();
	#pendingSenderListeners = [];
	#pendingRecverListerners = [];

	static Events = {
		UserAgent      : {
			Info       : 'room/useragent/info',
		},
		State          : 
		{
			Init       : 'room/state/init',
			Connecting : 'room/state/connecting',
			Connected  : 'room/state/connected',
			Closing    : 'room/state/closing',
			Closed     : 'room/state/closed',
			Error      : 'room/state/error',
		},
		ClientHandler  : {
			Created    : 'room/clientHandler/created',
		},
		Alerts         : {
			New        : 'room/alerts/new',
			Clear      : 'room/alerts/clear',
		},
		Peer           : {
			New        : 'room/peer/new',
			Closed     : 'room/peer/closed',
		},
		Producer       : {
			New        : 'room/producer/new',
			Removed    : 'room/producer/removed',
		},
		Consumer       : {
			New        : 'room/consumer/new',
			Removed    : 'room/consumer/removed',
		},
		WebRtcTransport : WebRtcTransport.Events,
	}

	static Types = {
		ConferenceRoom : 'conf-room',
	}

	constructor ({
		// Essentials
		session,
		// Returned by server upon room creation
		id, url, type, creationTS,
		// Client Caps allowed
		clientCaps,
		// Emitter options
		emitterOpts,
	})
	{
		super (emitterOpts);

		if (!session || !id || !url)
			throw new Error ('insufficient params');

		this.#session         = session;
		this.#id              = id;
		this.#url             = url;
		this.#state           = Room.Events.State.Init;
		this.#userAgentDevice = UserAgentDevice ();
		this.#canProduce      = clientCaps.canProduce;
		this.#canConsume      = clientCaps.canConsume;
		this.#useDataChannel  = clientCaps.useDataChannel;
		this.#mediasoupDevice = new mediasoupClient.Device ();

		this.emit (Room.Events.ClientHandler.Created, this.#mediasoupDevice.handlerName);
		this.emit (Room.Events.UserAgent.Info,        this.#userAgentDevice);

		this.#session.on ('info/newPeer',        ({ data }) => this.emit (Room.Events.Peer.New, data));
		this.#session.on ('info/peerClosed',     ({ data }) => this.#peerClosed (data));
		this.#session.on ('req/newConsumer',     ({ data }) => this.#newConsumer (data));
		this.#session.on ('info/consumerClosed', ({ data }) => this.#removeConsumer (data));
	}

	get id ()              { return this.#id; }
	get url ()             { return this.#url; }
	get isClosed ()        { return this.#state === Room.Events.State.Closed; }
	get session ()         { return this.#session; }
	get mediasoupDevice () { return this.#mediasoupDevice; }

	set state (s)          { this.#state = s.split ('/')[2]; this.emit (s); log.debug (`emitting ${s}`); }
	get state ()           { return this.#state; }

	get sender ()          { return this.#sender; }
	get recver ()          { return this.#recver; }

	async init () {
		const routerRtpCapabilities = await this.#session.request (
			/* REQ ID         */ 'getRouterRtpCapabilities',
			/* DATA           */ null,
			/* TO COMPONENT   */ 'core',
			/* FROM COMPONENT */ null,
		);

		await this.#mediasoupDevice.load ({ routerRtpCapabilities });
	}

	async createSendTransport (opts) {
		this.#sender = await SendTransport.create (
			this,
			{
				...opts,
				appData : {
					...(opts.appData || {}),
					VCID        : this.#session.VCID,
					displayName : this.#session.displayName,
					roomId      : this.#id
				}
			}
		);

		for (const evData of this.#pendingSenderListeners)
			this.#sender.on (evData.fqEvent, evData.handler);

		// empty the array
		this.#pendingSenderListeners = [];
	}

	async createRecvTransport (opts) {
		this.#recver = await RecvTransport.create (
			this,
			{
				...opts,
				appData : {
					...(opts.appData || {}),
					VCID        : this.#session.VCID,
					displayName : this.#session.displayName,
					roomId      : this.#id
				}
			}
		);

		for (const evData of this.#pendingRecverListerners)
			this.#recver.on (evData.fqEvent, evData.handler);

		// empty the array
		this.#pendingRecverListerners = [];
	}

	async join () {
		this.state = Room.Events.State.Connecting;

		const { peers } = await this.#session.request (
			/* REQ ID         */ 'join',
			/* DATA           */ {
				userAgent        : this.#userAgentDevice,
				rtpCapabilities  : this.#canConsume && this.#mediasoupDevice.rtpCapabilities,
				sctpCapabilities : this.#useDataChannel && this.#canConsume && this.#mediasoupDevice.sctpCapabilities,
			},
			/* TO COMPONENT   */ 'core',
			/* FROM COMPONENT */ null,
		);

		this.state = Room.Events.State.Connected;

		for (const peer of peers)
			this.emit (Room.Events.Peer.New, { ...peer, consumers: [] });
	}

	async addProducer (track, appData) {
		if (!this.#canProduce)
			throw new Error ('not configured to produce');

		const producer = await this.#sender.produce ({
			track,
			codecOptions : {
				opusStereo : true,
				opusDtx    : true,
				opusFec    : true,
				opusNack   : true
			},
			appData : {
				...appData,
				share : false,
			},
			// NOTE: for testing codec selection.
			// codec : this.#mediasoupDevice.rtpCapabilities.codecs
			// 	.find((codec) => codec.mimeType.toLowerCase() === 'audio/pcma')
		});

		this.emit (Room.Events.Producer.New, {
			id            : producer.id,
			paused        : producer.paused,
			track         : producer.track,
			rtpParameters : producer.rtpParameters,
			codec         : producer.rtpParameters.codecs[0].mimeType.split('/')[1]
		});

		this.#producers.set (producer.id, producer);

		track.addEventListener ('mute', (ev) => this.emit (Room.Events.Alerts.New, {
			type    : 'error',
			message : `Track ${track.kind} from ${track.label} is muted`,
		}));
		track.addEventListener ('unmute', (ev) => this.emit (Room.Events.Alerts.New, {
			type    : 'error',
			message : `Track ${track.kind} from ${track.label} is unmuted`,
		}));
		track.addEventListener ('ended', (ev) => this.emit (Room.Events.Alerts.New, {
			type    : 'error',
			message : `Track ${track.kind} from ${track.label} is ended`,
		}));
	}

	async removeProducer (track, appData) {
	}

	close () {
		if (this.isClosed)
			return;

		this.state = Room.Events.State.Closing;
	}

	on (fqEvent, handler) {
		const split        = fqEvent.split ('/');
		const subComponent = split[1];

		if (!subComponent)
			throw new Error (`unknown event "${fqEvent}"`);

		switch (subComponent) {

			case 'transport' :
				this.#listenToTransport (fqEvent, handler);
				break;

			default:
				super.on (fqEvent, handler);
				break;
		}
	}

	#listenToTransport (fqEvent, handler) {
		this.#sender ?  this.#sender.on (fqEvent, handler)
			: this.#pendingSenderListeners.push ({ fqEvent, handler });

		this.#recver ?  this.#recver.on (fqEvent, handler)
			: this.#pendingRecverListerners.push ({ fqEvent, handler });
	}

	async #newConsumer (data) {
		if (!this.#canConsume)
			throw new Error ('not configured to consume');

		const {
			peerId,
			peerVCID,
			producerId,
			id,
			kind,
			rtpParameters,
			type,
			appData,
			producerPaused
		} = data;

		const consumer = await this.#recver.consume ({
			id,
			producerId,
			kind,
			rtpParameters,
			// NOTE: Force streamId to be same in mic and webcam and different
			// in screen sharing so libwebrtc will just try to sync mic and
			// webcam streams from the same remote peer.
			streamId : `${peerId}-${appData.share ? 'share' : 'mic-webcam'}`,
			appData  : { ...appData, peerId, peerVCID } // Trick.
		});

		this.#consumers.set (consumer.id, consumer);
		log.debug ('consumer added to map:', consumer);

		const { spatialLayers, temporalLayers } = mediasoupClient.parseScalabilityMode (consumer.rtpParameters.encodings[0].scalabilityMode);
		this.emit (Room.Events.Consumer.New, {
			peerId,
			peerVCID,
			id                     : consumer.id,
			type                   : type,
			locallyPaused          : false,
			remotelyPaused         : producerPaused,
			rtpParameters          : consumer.rtpParameters,
			spatialLayers          : spatialLayers,
			temporalLayers         : temporalLayers,
			preferredSpatialLayer  : spatialLayers - 1,
			preferredTemporalLayer : temporalLayers - 1,
			priority               : 1,
			codec                  : consumer.rtpParameters.codecs[0].mimeType.split('/')[1],
			track                  : consumer.track
		});

	}

	#peerClosed (data) {
		const { VCID } = data;

		const consumersToDelete = Array.from (this.#consumers.values ()).filter (c => c.appData.peerVCID === VCID);

		for (const consumer of consumersToDelete)
			this.#removeConsumer ({ consumerId: consumer.id, reason: 'peer closed' })

		this.emit (Room.Events.Peer.Closed, data);
	}

	#removeConsumer ({ consumerId, reason }) {
		const consumer = this.#consumers.get (consumerId);

		if (!consumer)
			return;

		const { appData } = consumer;

		this.#consumers.delete (consumerId);
		this.emit (Room.Events.Consumer.Removed, { consumer, reason });
	}
}
