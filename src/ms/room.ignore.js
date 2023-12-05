import EventEmitter         from 'eventemitter2';
import Session              from './session';
import WebRtcTransport      from './webrtc-transport';
import * as mediasoupClient from 'mediasoup-client';
import * as e2e             from 'ms/e2e';
import Log                  from 'common/log';
import store                from 'store';
import {
	addConsumer,
	removeConsumer,
}     from 'slices/consumers';
import {
	addPeer,
	removePeer,
}     from 'slices/peers';
import * as cookiesManager  from 'common/cookies-manager';

// Temp
const stateActions = {};

const VIDEO_CONSTRAINS =
{
	qvga : { width: { ideal: 320 }, height: { ideal: 240 } },
	vga  : { width: { ideal: 640 }, height: { ideal: 480 } },
	hd   : { width: { ideal: 1280 }, height: { ideal: 720 } }
};

const EV = {
	STATE : {
		CONNECTING : 'room/state:connecting',
		CONNECTED  : 'room/state:connected',
		CLOSED     : 'room/state:closed',
		ERROR      : 'room/state:error',
	},
	CLIENT_HANDLER : {
		CREATED    : 'room/client-handler:created'
	},
	NOTIFY                 : 'room/notify',
	REMOVEALLNOTIFICATIONS : 'room/removeAllNotifications',
	PRODUCERS: {
		ADD : 'room/producers:add',
	},
	CONSUMERS: {
		ADD : 'room/consumers:add',
	},
	PEER: {
		ADD : 'room/peer:add',
	},
	ME: {
		SETMEDIACAPS       : 'room/me:setMediaCapabilities',
		SETWEBCAMINPROG    : 'room/me:setWebcamInProgress',
		SETCANCHANGEWEBCAM : 'room/me:setCanChangeWebcam',
	},
};

const TYPES = {
	CONFERENCE_ROOM : 'conf-room',
};

const EXTERNAL_VIDEO_SRC = '/resources/videos/video-audio-stereo.mp4';

const log = new Log ('Room');

export default class Room extends EventEmitter {
	#session
	#cred

	static EV = EV;
	static TYPES = TYPES;

	constructor ({
			session, id:roomId, url, type,
			device, handlerName, forceTcp, produce,
			consume, datachannel, enableWebcamLayers,
			enableSharingLayers, webcamScalabilityMode,
			sharingScalabilityMode, numSimulcastStreams,
			forceVP8, forceH264, forceVP9,
			externalVideo, e2eKey, consumerReplicas,
		}) {

		super ();

		this._roomId = roomId;
		this._url    = url;
		this._closed = false;
		this._device = device;
		this._handlerName = handlerName;
		this._forceTcp = !!forceTcp;
		this._produce = produce;
		this._consume = consume;
		this._useDataChannel = Boolean(datachannel);
		this._forceVP8 = Boolean(forceVP8);
		this._forceH264 = Boolean(forceH264);
		this._forceVP9 = Boolean(forceVP9);
		this._enableWebcamLayers = Boolean(enableWebcamLayers);
		this._enableSharingLayers = Boolean(enableSharingLayers);
		this._webcamScalabilityMode = webcamScalabilityMode;
		this._sharingScalabilityMode = sharingScalabilityMode;
		this._numSimulcastStreams = numSimulcastStreams;
		this._externalVideo = null;
		this._e2eKey = e2eKey;
		this._externalVideoStream = null;
		this._nextDataChannelTestNumber = 0;

		if (externalVideo)
		{
			this._externalVideo = document.createElement('video');

			this._externalVideo.controls = true;
			this._externalVideo.muted = true;
			this._externalVideo.loop = true;
			this._externalVideo.setAttribute('playsinline', '');
			this._externalVideo.src = EXTERNAL_VIDEO_SRC;

			this._externalVideo.play()
				.catch((error) => log.warn('externalVideo.play() failed:%o', error));
		}

		this.#session = session;
		this._mediasoupDevice = null;
		this._send = null;
		this._recv = null;
		this._micProducer = null;
		this._webcamProducer = null;
		this._shareProducer = null;
		this._consumers = new Map();
		this._dataConsumers = new Map();
		this._webcams = new Map();

		// Local Webcam.
		// @type {Object} with:
		// - {MediaDeviceInfo} [device]
		// - {String} [resolution] - 'qvga' / 'vga' / 'hd'.
		this._webcam =
		{
			device     : null,
			resolution : 'hd'
		};

		if (this._e2eKey && e2e.isSupported())
		{
			e2e.setCryptoKey('setCryptoKey', this._e2eKey, true);
		}
	}

	set credentials (c) { 
		this.#cred        = c;
		this._peerId      = c.id;
		this._displayName = c.displayName;
		this._VCID        = c.VCID;
	}

	get url () { return this._url; }
	get session () { return this.#session; }
	get useDataChannel () { return this._useDataChannel; }
	get device () { return this._device; }
	get e2eKey () { return this._e2eKey; }
	get forceTcp () { return this._forceTcp; }

	close () {
		if (this._closed)
			return;

		this._closed = true;

		log.debug('close()');

		// Close protoo Peer
		this._transport.terminate ();

		// Close mediasoup Transports.
		if (this._send)
			this._send.close();

		if (this._recv)
			this._recv.close();

		this.emit (EV.STATE.CLOSED);
	}

	async #createNewConsumer ({ data }) {
		if (!this._consume)
			throw new Error ('not configured to consume');

		const {
			peerId,
			producerId,
			id,
			kind,
			rtpParameters,
			type,
			appData,
			producerPaused
		} = data;

		try
		{
			const consumer = await this._recv.transport.consume (
				{
					id,
					producerId,
					kind,
					rtpParameters,
					// NOTE: Force streamId to be same in mic and webcam and different
					// in screen sharing so libwebrtc will just try to sync mic and
					// webcam streams from the same remote peer.
					streamId : `${peerId}-${appData.share ? 'share' : 'mic-webcam'}`,
					appData  : { ...appData, peerId } // Trick.
				});

			if (this._e2eKey && e2e.isSupported ()) {
				e2e.setupReceiverTransform (consumer.rtpReceiver);
			}

			// Store in the map.
			this._consumers.set (consumer.id, consumer);

			consumer.on ('transportclose', () => {
				log.info (`consumer ${consumer.id} closed`);
				this._consumers.delete(consumer.id);
			});

			const { spatialLayers, temporalLayers } =
				mediasoupClient.parseScalabilityMode(
					consumer.rtpParameters.encodings[0].scalabilityMode);

			this.emit (EV.CONSUMERS.ADD, {
				consumer : {
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
				},
				peerId
			});

			return true;
		}
		catch (error)
		{
			log.error('"newConsumer" request failed:', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error creating a Consumer: ${error}`
			});

			throw error;
		}
	}

	async join () {
		this.#session.on ('req/newConsumer', (data) => this.#createNewConsumer (data));
		this._joinRoom ();

		/*
		this._protoo.on('disconnected', () =>
		{
			log.warn ('disconnected ...')
			this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : 'WebSocket disconnected'
				});

			// Close mediasoup Transports.
			if (this._send)
			{
				this._send.close();
				this._send = null;
			}

			if (this._recv)
			{
				this._recv.close();
				this._recv = null;
			}

			this.emit (EV.STATE.CLOSED);
		});

		this._protoo.on('close', () =>
		{
			log.warn ('close event on Websocket ...')
			if (this._closed)
				return;

			this.close();
		});
		*/

		// eslint-disable-next-line no-unused-vars
		/*
		this._protoo.on('request', async (request, accept, reject) =>
		{
			log.debug(
				'proto "request" event [method:%s, data:%o]',
				request.method, request.data);

			switch (request.method)
			{
				case 'newConsumer':
				{
				}

				case 'newDataConsumer':
				{
					if (!this._consume)
					{
						reject(403, 'I do not want to data consume');

						break;
					}

					if (!this._useDataChannel)
					{
						reject(403, 'I do not want DataChannels');

						break;
					}

					const {
						peerId, // NOTE: Null if bot.
						dataProducerId,
						id,
						sctpStreamParameters,
						label,
						protocol,
						appData
					} = request.data;

					try
					{
						const dataConsumer = await this._recv.consumeData(
							{
								id,
								dataProducerId,
								sctpStreamParameters,
								label,
								protocol,
								appData : { ...appData, peerId } // Trick.
							});

						// Store in the map.
						this._dataConsumers.set(dataConsumer.id, dataConsumer);

						dataConsumer.on('transportclose', () =>
						{
							this._dataConsumers.delete(dataConsumer.id);
						});

						dataConsumer.on('open', () =>
						{
							log.debug('DataConsumer "open" event');
						});

						dataConsumer.on('close', () =>
						{
							log.warn('DataConsumer "close" event');

							this._dataConsumers.delete(dataConsumer.id);

							this.emit (EV.STATE.NOTIFY, {
									type : 'error',
									text : 'DataConsumer closed'
							});
						});

						dataConsumer.on('error', (error) =>
						{
							log.error('DataConsumer "error" event:%o', error);

							this.emit (EV.STATE.NOTIFY, {
									type : 'error',
									text : `DataConsumer error: ${error}`
							});
						});

						dataConsumer.on('message', (message) =>
						{
							log.debug(
								'DataConsumer "message" event [streamId:%d]',
								dataConsumer.sctpStreamParameters.streamId);

							// TODO: For debugging.
							window.DC_MESSAGE = message;

							if (message instanceof ArrayBuffer)
							{
								const view = new DataView(message);
								const number = view.getUint32();

								if (number == Math.pow(2, 32) - 1)
								{
									log.warn('dataChannelTest finished!');

									this._nextDataChannelTestNumber = 0;

									return;
								}

								if (number > this._nextDataChannelTestNumber)
								{
									log.warn(
										'dataChannelTest: %s packets missing',
										number - this._nextDataChannelTestNumber);
								}

								this._nextDataChannelTestNumber = number + 1;

								return;
							}
							else if (typeof message !== 'string')
							{
								log.warn('ignoring DataConsumer "message" (not a string)');

								return;
							}

							switch (dataConsumer.label)
							{
								case 'chat':
								{
									const { peers } = store.getState();
									const peersArray = Object.keys(peers)
										.map((_peerId) => peers[_peerId]);
									const sendingPeer = peersArray
										.find((peer) => peer.dataConsumers.includes(dataConsumer.id));

									if (!sendingPeer)
									{
										log.warn('DataConsumer "message" from unknown peer');

										break;
									}

									this.emit (EV.STATE.NOTIFY, {
										title   : `${sendingPeer.displayName} says:`,
										text    : message,
										timeout : 5000
									});

									break;
								}

								case 'bot':
								{
									this.emit (EV.STATE.NOTIFY,
										{
											title   : 'Message from Bot:',
											text    : message,
											timeout : 5000
										});

									break;
								}

								default:
									log.error ('unknown data consumer label:', dataConsumer.label);
							}
						});

						// TODO: REMOVE
						window.DC = dataConsumer;

						store.dispatch(stateActions.addDataConsumer(
							{
								id                   : dataConsumer.id,
								sctpStreamParameters : dataConsumer.sctpStreamParameters,
								label                : dataConsumer.label,
								protocol             : dataConsumer.protocol
							},
							peerId));

						// We are ready. Answer the protoo request.
						accept();
					}
					catch (error)
					{
						log.error('"newDataConsumer" request failed:%o', error);

						this.emit (EV.STATE.NOTIFY,
							{
								type : 'error',
								text : `Error creating a DataConsumer: ${error}`
							});

						throw error;
					}

					break;
				}

				default:
					log.error ('unknown request:', request.method);
			}
		});

		this._protoo.on('notification', (notification) =>
		{
			log.debug(
				'proto "notification" event [method:%s, data:%o]',
				notification.method, notification.data);

			switch (notification.method)
			{
				case 'producerScore':
				{
					const { producerId, score } = notification.data;

					store.dispatch(
						stateActions.setProducerScore(producerId, score));

					break;
				}

				case 'newPeer':
				{
					const peer = notification.data;

					this.emit (EV.PEER.ADD, ({ ...peer, consumers: [], dataConsumers: [] }));

					this.emit (EV.STATE.NOTIFY,
						{
							text : `${peer.displayName} has joined the room`
						});

					break;
				}

				case 'peerClosed':
				{
					const { peerId } = notification.data;

					store.dispatch(removePeer(peerId));

					break;
				}

				case 'peerDisplayNameChanged':
				{
					const { peerId, displayName, oldDisplayName } = notification.data;

					store.dispatch(
						stateActions.setPeerDisplayName(displayName, peerId));

					this.emit (EV.STATE.NOTIFY,
						{
							text : `${oldDisplayName} is now ${displayName}`
						});

					break;
				}

				case 'downlinkBwe':
				{
					log.debug('\'downlinkBwe\' event:%o', notification.data);

					break;
				}

				case 'consumerClosed':
				{
					const { consumerId } = notification.data;
					const consumer = this._consumers.get(consumerId);

					if (!consumer)
						break;

					consumer.close();
					this._consumers.delete(consumerId);

					const { peerId } = consumer.appData;

					store.dispatch (removeConsumer ({ consumerId, peerId }));

					break;
				}

				case 'consumerPaused':
				{
					const { consumerId } = notification.data;
					const consumer = this._consumers.get(consumerId);

					if (!consumer)
						break;

					consumer.pause();

					store.dispatch(
						stateActions.setConsumerPaused(consumerId, 'remote'));

					break;
				}

				case 'consumerResumed':
				{
					const { consumerId } = notification.data;
					const consumer = this._consumers.get(consumerId);

					if (!consumer)
						break;

					consumer.resume();

					store.dispatch(
						stateActions.setConsumerResumed(consumerId, 'remote'));

					break;
				}

				case 'consumerLayersChanged':
				{
					const { consumerId, spatialLayer, temporalLayer } = notification.data;
					const consumer = this._consumers.get(consumerId);

					if (!consumer)
						break;

					store.dispatch(stateActions.setConsumerCurrentLayers(
						consumerId, spatialLayer, temporalLayer));

					break;
				}

				case 'consumerScore':
				{
					const { consumerId, score } = notification.data;

					store.dispatch(
						stateActions.setConsumerScore(consumerId, score));

					break;
				}

				case 'dataConsumerClosed':
				{
					const { dataConsumerId } = notification.data;
					const dataConsumer = this._dataConsumers.get(dataConsumerId);

					if (!dataConsumer)
						break;

					dataConsumer.close();
					this._dataConsumers.delete(dataConsumerId);

					const { peerId } = dataConsumer.appData;

					store.dispatch(
						stateActions.removeDataConsumer(dataConsumerId, peerId));

					break;
				}

				case 'activeSpeaker':
				{
					const { peerId } = notification.data;

					store.dispatch(
						stateActions.setRoomActiveSpeaker(peerId));

					break;
				}

				default:
				{
					log.error(
						'unknown protoo notification.method "%s"', notification.method);
				}
			}
		});
		*/
	}

	async enableMic () {
		log.debug('enableMic()');

		if (this._micProducer)
			return;

		if (!this._mediasoupDevice.canProduce ('audio')) {
			log.error ('enableMic() | cannot produce audio');
			return;
		}

		let track;

		try
		{
			if (!this._externalVideo) {
				log.debug ('enableMic() | calling getUserMedia()');

				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

				track = stream.getAudioTracks()[0];
			}
			else
			{
				const stream = await this._getExternalVideoStream ();

				track = stream.getAudioTracks()[0].clone ();
			}

			this._micProducer = await this._send.transport.produce (
				{
					track,
					codecOptions :
					{
						opusStereo : true,
						opusDtx    : true,
						opusFec    : true,
						opusNack   : true
					},
					appData : {
						share : false,
					},
					// NOTE: for testing codec selection.
					// codec : this._mediasoupDevice.rtpCapabilities.codecs
					// 	.find((codec) => codec.mimeType.toLowerCase() === 'audio/pcma')
				});

			if (this._e2eKey && e2e.isSupported ())
				e2e.setupSenderTransform (this._micProducer.rtpSender);

			this.emit (EV.PRODUCERS.ADD, {
				id            : this._micProducer.id,
				paused        : this._micProducer.paused,
				track         : this._micProducer.track,
				rtpParameters : this._micProducer.rtpParameters,
				codec         : this._micProducer.rtpParameters.codecs[0].mimeType.split('/')[1]
			});

			this._micProducer.on ('transportclose', () => {
				this._micProducer = null;
			});

			this._micProducer.on ('trackended', () => {
				this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : 'Microphone disconnected!'
				});

				this.disableMic ()
					.catch((err) => { log.error ('error while disabling mic:', err)});
			});

			log.debug ('enableMic OK');
		}
		catch (error) {
			log.error ('enableMic() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error enabling microphone: ${error}`
			});

			if (track)
				track.stop();
		}
	}

	async disableMic()
	{
		log.debug('disableMic()');

		if (!this._micProducer)
			return;

		this._micProducer.close();

		store.dispatch(
			stateActions.removeProducer(this._micProducer.id));

		try {
			await this._protoo.request(
				'closeProducer', { producerId: this._micProducer.id });
		}
		catch (error) {
			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error closing server-side mic Producer: ${error}`
			});
		}

		this._micProducer = null;
	}

	async muteMic()
	{
		log.debug('muteMic()');

		this._micProducer.pause();

		try
		{
			await this._protoo.request(
				'pauseProducer', { producerId: this._micProducer.id });

			store.dispatch(
				stateActions.setProducerPaused(this._micProducer.id));
		}
		catch (error)
		{
			log.error('muteMic() | failed: %o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error pausing server-side mic Producer: ${error}`
			});
		}
	}

	async unmuteMic()
	{
		log.debug('unmuteMic()');

		this._micProducer.resume();

		try
		{
			await this._protoo.request(
				'resumeProducer', { producerId: this._micProducer.id });

			store.dispatch(
				stateActions.setProducerResumed(this._micProducer.id));
		}
		catch (error)
		{
			log.error('unmuteMic() | failed: %o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error resuming server-side mic Producer: ${error}`
			});
		}
	}

	async enableWebcam()
	{
		log.debug('enableWebcam()');

		if (this._webcamProducer)
			return;
		else if (this._shareProducer)
			await this.disableShare();

		if (!this._mediasoupDevice.canProduce('video'))
		{
			log.error('enableWebcam() | cannot produce video');

			return;
		}

		let track;
		let device;

		this.emit (EV.ME.SETWEBCAMINPROG, true);

		try
		{
			if (!this._externalVideo)
			{
				await this._updateWebcams();
				device = this._webcam.device;

				const { resolution } = this._webcam;

				if (!device)
					throw new Error('no webcam devices');

				log.debug('enableWebcam() | calling getUserMedia()');

				const stream = await navigator.mediaDevices.getUserMedia(
					{
						video :
						{
							deviceId : { ideal: device.deviceId },
							...VIDEO_CONSTRAINS[resolution]
						}
					});

				track = stream.getVideoTracks()[0];
			}
			else
			{
				device = { label: 'external video' };

				const stream = await this._getExternalVideoStream();

				track = stream.getVideoTracks()[0].clone();
			}

			let encodings;
			let codec;
			const codecOptions =
			{
				videoGoogleStartBitrate : 1000
			};

			if (this._forceVP8)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/vp8');

				if (!codec)
				{
					throw new Error('desired VP8 codec+configuration is not supported');
				}
			}
			else if (this._forceH264)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/h264');

				if (!codec)
				{
					throw new Error('desired H264 codec+configuration is not supported');
				}
			}
			else if (this._forceVP9)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/vp9');

				if (!codec)
				{
					throw new Error('desired VP9 codec+configuration is not supported');
				}
			}

			if (this._enableWebcamLayers)
			{
				// If VP9 is the only available video codec then use SVC.
				const firstVideoCodec = this._mediasoupDevice
					.rtpCapabilities
					.codecs
					.find((c) => c.kind === 'video');

				// VP9 with SVC.
				if (
					(this._forceVP9 && codec) ||
					firstVideoCodec.mimeType.toLowerCase() === 'video/vp9'
				)
				{
					encodings =
					[
						{
							maxBitrate      : 5000000,
							scalabilityMode : this._webcamScalabilityMode || 'L3T3_KEY'
						}
					];
				}
				// VP8 or H264 with simulcast.
				else
				{
					encodings =
					[
						{
							scaleResolutionDownBy : 1,
							maxBitrate            : 5000000,
							scalabilityMode       : this._webcamScalabilityMode || 'L1T3'
						}
					];

					if (this._numSimulcastStreams > 1)
					{
						encodings.unshift(
							{
								scaleResolutionDownBy : 2,
								maxBitrate            : 1000000,
								scalabilityMode       : this._webcamScalabilityMode || 'L1T3'
							}
						);
					}

					if (this._numSimulcastStreams > 2)
					{
						encodings.unshift(
							{
								scaleResolutionDownBy : 4,
								maxBitrate            : 500000,
								scalabilityMode       : this._webcamScalabilityMode || 'L1T3'
							}
						);
					}
				}
			}

			this._webcamProducer = await this._send.transport.produce ({
				track,
				encodings,
				codecOptions,
				codec,
				appData : {
					share : false,
				}
			});

			if (this._e2eKey && e2e.isSupported())
			{
				e2e.setupSenderTransform(this._webcamProducer.rtpSender);
			}

			this.emit (EV.PRODUCERS.ADD, {
				id            : this._webcamProducer.id,
				deviceLabel   : device.label,
				type          : this._getWebcamType(device),
				paused        : this._webcamProducer.paused,
				track         : this._webcamProducer.track,
				rtpParameters : this._webcamProducer.rtpParameters,
				codec         : this._webcamProducer.rtpParameters.codecs[0].mimeType.split('/')[1]
			});

			this._webcamProducer.on('transportclose', () =>
			{
				this._webcamProducer = null;
			});

			this._webcamProducer.on('trackended', () =>
			{
				this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : 'Webcam disconnected!'
				});

				this.disableWebcam()
					.catch(() => {});
			});
		}
		catch (error)
		{
			log.error('enableWebcam() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error enabling webcam: ${error}`
			});

			if (track)
				track.stop();
		}

		this.emit (EV.ME.SETWEBCAMINPROG, false);
	}

	async disableWebcam()
	{
		log.debug('disableWebcam()');

		if (!this._webcamProducer)
			return;

		this._webcamProducer.close();

		store.dispatch(
			stateActions.removeProducer(this._webcamProducer.id));

		try
		{
			await this._protoo.request(
				'closeProducer', { producerId: this._webcamProducer.id });
		}
		catch (error)
		{
			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error closing server-side webcam Producer: ${error}`
			});
		}

		this._webcamProducer = null;
	}

	async changeWebcam()
	{
		log.debug('changeWebcam()');

		this.emit (EV.ME.SETWEBCAMINPROG, true);

		try
		{
			await this._updateWebcams();

			const array = Array.from(this._webcams.keys());
			const len = array.length;
			const deviceId =
				this._webcam.device ? this._webcam.device.deviceId : undefined;
			let idx = array.indexOf(deviceId);

			if (idx < len - 1)
				idx++;
			else
				idx = 0;

			this._webcam.device = this._webcams.get(array[idx]);

			log.debug(
				'changeWebcam() | new selected webcam [device:%o]',
				this._webcam.device);

			// Reset video resolution to HD.
			this._webcam.resolution = 'hd';

			if (!this._webcam.device)
				throw new Error('no webcam devices');

			// Closing the current video track before asking for a new one (mobiles do not like
			// having both front/back cameras open at the same time).
			this._webcamProducer.track.stop();

			log.debug('changeWebcam() | calling getUserMedia()');

			const stream = await navigator.mediaDevices.getUserMedia(
				{
					video :
					{
						deviceId : { exact: this._webcam.device.deviceId },
						...VIDEO_CONSTRAINS[this._webcam.resolution]
					}
				});

			const track = stream.getVideoTracks()[0];

			await this._webcamProducer.replaceTrack({ track });

			store.dispatch(
				stateActions.setProducerTrack(this._webcamProducer.id, track));
		}
		catch (error)
		{
			log.error('changeWebcam() | failed: %o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Could not change webcam: ${error}`
			});
		}

		this.emit (EV.ME.SETWEBCAMINPROG, false);
	}

	async changeWebcamResolution()
	{
		log.debug('changeWebcamResolution()');

		this.emit (EV.ME.SETWEBCAMINPROG, true);

		try
		{
			switch (this._webcam.resolution)
			{
				case 'qvga':
					this._webcam.resolution = 'vga';
					break;
				case 'vga':
					this._webcam.resolution = 'hd';
					break;
				case 'hd':
					this._webcam.resolution = 'qvga';
					break;
				default:
					this._webcam.resolution = 'hd';
			}

			log.debug('changeWebcamResolution() | calling getUserMedia()');

			const stream = await navigator.mediaDevices.getUserMedia(
				{
					video :
					{
						deviceId : { exact: this._webcam.device.deviceId },
						...VIDEO_CONSTRAINS[this._webcam.resolution]
					}
				});

			const track = stream.getVideoTracks()[0];

			await this._webcamProducer.replaceTrack({ track });

			store.dispatch(
				stateActions.setProducerTrack(this._webcamProducer.id, track));
		}
		catch (error)
		{
			log.error('changeWebcamResolution() | failed: %o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Could not change webcam resolution: ${error}`
			});
		}

		this.emit (EV.ME.SETWEBCAMINPROG, false);
	}

	async enableShare()
	{
		log.debug('enableShare()');

		if (this._shareProducer)
			return;
		else if (this._webcamProducer)
			await this.disableWebcam();

		if (!this._mediasoupDevice.canProduce('video'))
		{
			log.error('enableShare() | cannot produce video');

			return;
		}

		let track;

		store.dispatch(
			stateActions.setShareInProgress(true));

		try
		{
			log.debug('enableShare() | calling getUserMedia()');

			const stream = await navigator.mediaDevices.getDisplayMedia(
				{
					audio : false,
					video :
					{
						displaySurface : 'monitor',
						logicalSurface : true,
						cursor         : true,
						width          : { max: 1920 },
						height         : { max: 1080 },
						frameRate      : { max: 30 }
					}
				});

			// May mean cancelled (in some implementations).
			if (!stream)
			{
				store.dispatch(
					stateActions.setShareInProgress(true));

				return;
			}

			track = stream.getVideoTracks()[0];

			let encodings;
			let codec;
			const codecOptions =
			{
				videoGoogleStartBitrate : 1000
			};

			if (this._forceVP8)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/vp8');

				if (!codec)
				{
					throw new Error('desired VP8 codec+configuration is not supported');
				}
			}
			else if (this._forceH264)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/h264');

				if (!codec)
				{
					throw new Error('desired H264 codec+configuration is not supported');
				}
			}
			else if (this._forceVP9)
			{
				codec = this._mediasoupDevice.rtpCapabilities.codecs
					.find((c) => c.mimeType.toLowerCase() === 'video/vp9');

				if (!codec)
				{
					throw new Error('desired VP9 codec+configuration is not supported');
				}
			}

			if (this._enableSharingLayers)
			{
				// If VP9 is the only available video codec then use SVC.
				const firstVideoCodec = this._mediasoupDevice
					.rtpCapabilities
					.codecs
					.find((c) => c.kind === 'video');

				// VP9 with SVC.
				if (
					(this._forceVP9 && codec) ||
					firstVideoCodec.mimeType.toLowerCase() === 'video/vp9'
				)
				{
					encodings =
					[
						{
							maxBitrate      : 5000000,
							scalabilityMode : this._sharingScalabilityMode || 'L3T3',
							dtx             : true
						}
					];
				}
				// VP8 or H264 with simulcast.
				else
				{
					encodings =
					[
						{
							scaleResolutionDownBy : 1,
							maxBitrate            : 5000000,
							scalabilityMode       : this._sharingScalabilityMode || 'L1T3',
							dtx                   : true
						}
					];

					if (this._numSimulcastStreams > 1)
					{
						encodings.unshift(
							{
								scaleResolutionDownBy : 2,
								maxBitrate            : 1000000,
								scalabilityMode       : this._sharingScalabilityMode || 'L1T3',
								dtx                   : true
							}
						);
					}

					if (this._numSimulcastStreams > 2)
					{
						encodings.unshift(
							{
								scaleResolutionDownBy : 4,
								maxBitrate            : 500000,
								scalabilityMode       : this._sharingScalabilityMode || 'L1T3',
								dtx                   : true
							}
						);
					}
				}
			}

			this._shareProducer = await this._send.produce(
				{
					track,
					encodings,
					codecOptions,
					codec,
					appData :
					{
						share : true
					}
				});

			if (this._e2eKey && e2e.isSupported())
			{
				e2e.setupSenderTransform(this._shareProducer.rtpSender);
			}

			this.emit (EV.PRODUCERS.ADD, {
				id            : this._shareProducer.id,
				type          : 'share',
				paused        : this._shareProducer.paused,
				track         : this._shareProducer.track,
				rtpParameters : this._shareProducer.rtpParameters,
				codec         : this._shareProducer.rtpParameters.codecs[0].mimeType.split('/')[1]
			});

			this._shareProducer.on('transportclose', () =>
			{
				this._shareProducer = null;
			});

			this._shareProducer.on('trackended', () =>
			{
				this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : 'Share disconnected!'
				});

				this.disableShare()
					.catch(() => {});
			});
		}
		catch (error)
		{
			log.error('enableShare() | failed:%o', error);

			if (error.name !== 'NotAllowedError')
			{
				this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : `Error sharing: ${error}`
				});
			}

			if (track)
				track.stop();
		}

		store.dispatch(
			stateActions.setShareInProgress(false));
	}

	async disableShare()
	{
		log.debug('disableShare()');

		if (!this._shareProducer)
			return;

		this._shareProducer.close();

		store.dispatch(
			stateActions.removeProducer(this._shareProducer.id));

		try
		{
			await this._protoo.request(
				'closeProducer', { producerId: this._shareProducer.id });
		}
		catch (error)
		{
			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error closing server-side share Producer: ${error}`
			});
		}

		this._shareProducer = null;
	}

	async enableAudioOnly()
	{
		log.debug('enableAudioOnly()');

		store.dispatch(
			stateActions.setAudioOnlyInProgress(true));

		this.disableWebcam();

		for (const consumer of this._consumers.values())
		{
			if (consumer.kind !== 'video')
				continue;

			this._pauseConsumer(consumer);
		}

		store.dispatch(
			stateActions.setAudioOnlyState(true));

		store.dispatch(
			stateActions.setAudioOnlyInProgress(false));
	}

	async disableAudioOnly()
	{
		log.debug('disableAudioOnly()');

		store.dispatch(
			stateActions.setAudioOnlyInProgress(true));

		if (
			!this._webcamProducer &&
			this._produce &&
			(cookiesManager.getDevices() || {}).webcamEnabled
		)
		{
			this.enableWebcam();
		}

		for (const consumer of this._consumers.values())
		{
			if (consumer.kind !== 'video')
				continue;

			this._resumeConsumer(consumer);
		}

		store.dispatch(
			stateActions.setAudioOnlyState(false));

		store.dispatch(
			stateActions.setAudioOnlyInProgress(false));
	}

	async muteAudio()
	{
		log.debug('muteAudio()');

		store.dispatch(
			stateActions.setAudioMutedState(true));
	}

	async unmuteAudio()
	{
		log.debug('unmuteAudio()');

		store.dispatch(
			stateActions.setAudioMutedState(false));
	}

	async restartIce()
	{
		log.debug('restartIce()');

		store.dispatch(
			stateActions.setRestartIceInProgress(true));

		try
		{
			if (this._send)
			{
				const iceParameters = await this._protoo.request(
					'restartIce',
					{ transportId: this._send.id });

				await this._send.restartIce({ iceParameters });
			}

			if (this._recv)
			{
				const iceParameters = await this._protoo.request(
					'restartIce',
					{ transportId: this._recv.id });

				await this._recv.restartIce({ iceParameters });
			}

			this.emit (EV.STATE.NOTIFY, {
				text : 'ICE restarted'
			});
		}
		catch (error)
		{
			log.error('restartIce() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `ICE restart failed: ${error}`
			});
		}

		store.dispatch(
			stateActions.setRestartIceInProgress(false));
	}

	async setMaxSendingSpatialLayer(spatialLayer)
	{
		log.debug('setMaxSendingSpatialLayer() [spatialLayer:%s]', spatialLayer);

		try
		{
			if (this._webcamProducer)
				await this._webcamProducer.setMaxSpatialLayer(spatialLayer);
			else if (this._shareProducer)
				await this._shareProducer.setMaxSpatialLayer(spatialLayer);
		}
		catch (error)
		{
			log.error('setMaxSendingSpatialLayer() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error setting max sending video spatial layer: ${error}`
			});
		}
	}

	async setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer)
	{
		log.debug(
			'setConsumerPreferredLayers() [consumerId:%s, spatialLayer:%s, temporalLayer:%s]',
			consumerId, spatialLayer, temporalLayer);

		try
		{
			await this._protoo.request(
				'setConsumerPreferredLayers', { consumerId, spatialLayer, temporalLayer });

			store.dispatch(stateActions.setConsumerPreferredLayers(
				consumerId, spatialLayer, temporalLayer));
		}
		catch (error)
		{
			log.error('setConsumerPreferredLayers() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error setting Consumer preferred layers: ${error}`
			});
		}
	}

	async setConsumerPriority(consumerId, priority)
	{
		log.debug(
			'setConsumerPriority() [consumerId:%s, priority:%d]',
			consumerId, priority);

		try
		{
			await this._protoo.request('setConsumerPriority', { consumerId, priority });

			store.dispatch(stateActions.setConsumerPriority(consumerId, priority));
		}
		catch (error)
		{
			log.error('setConsumerPriority() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error setting Consumer priority: ${error}`
			});
		}
	}

	async requestConsumerKeyFrame(consumerId)
	{
		log.debug('requestConsumerKeyFrame() [consumerId:%s]', consumerId);

		try
		{
			await this._protoo.request('requestConsumerKeyFrame', { consumerId });

			this.emit (EV.STATE.NOTIFY, {
				text : 'Keyframe requested for video consumer'
			});
		}
		catch (error)
		{
			log.error('requestConsumerKeyFrame() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error requesting key frame for Consumer: ${error}`
			});
		}
	}

	async sendChatMessage(text)
	{
		log.debug('sendChatMessage() [text:"%s]', text);

		if (!this._chatDataProducer)
		{
			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : 'No chat DataProducer'
			});

			return;
		}

		try
		{
			this._chatDataProducer.send(text);
		}
		catch (error)
		{
			log.error('chat DataProducer.send() failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `chat DataProducer.send() failed: ${error}`
			});
		}
	}

	async sendBotMessage(text)
	{
		log.debug('sendBotMessage() [text:"%s]', text);

		if (!this._botDataProducer)
		{
			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : 'No bot DataProducer'
			});

			return;
		}

		try
		{
			this._botDataProducer.send(text);
		}
		catch (error)
		{
			log.error('bot DataProducer.send() failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `bot DataProducer.send() failed: ${error}`
			});
		}
	}

	async changeDisplayName(displayName)
	{
		log.debug('changeDisplayName() [displayName:"%s"]', displayName);

		// Store in cookie.
		cookiesManager.setUser({ displayName });

		try
		{
			await this._protoo.request('changeDisplayName', { displayName });

			this._displayName = displayName;

			store.dispatch(
				stateActions.setDisplayName(displayName));

			this.emit (EV.STATE.NOTIFY, {
				text : 'Display name changed'
			});
		}
		catch (error)
		{
			log.error('changeDisplayName() | failed: %o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Could not change display name: ${error}`
			});

			// We need to refresh the component for it to render the previous
			// displayName again.
			store.dispatch(
				stateActions.setDisplayName());
		}
	}

	async getSendTransportRemoteStats()
	{
		log.debug('getSendTransportRemoteStats()');

		if (!this._send)
			return;

		return this._protoo.request(
			'getTransportStats', { transportId: this._send.id });
	}

	async getRecvTransportRemoteStats()
	{
		log.debug('getRecvTransportRemoteStats()');

		if (!this._recv)
			return;

		return this._protoo.request(
			'getTransportStats', { transportId: this._recv.id });
	}

	async getAudioRemoteStats()
	{
		log.debug('getAudioRemoteStats()');

		if (!this._micProducer)
			return;

		return this._protoo.request(
			'getProducerStats', { producerId: this._micProducer.id });
	}

	async getVideoRemoteStats()
	{
		log.debug('getVideoRemoteStats()');

		const producer = this._webcamProducer || this._shareProducer;

		if (!producer)
			return;

		return this._protoo.request(
			'getProducerStats', { producerId: producer.id });
	}

	async getConsumerRemoteStats(consumerId)
	{
		log.debug('getConsumerRemoteStats()');

		const consumer = this._consumers.get(consumerId);

		if (!consumer)
			return;

		return this._protoo.request('getConsumerStats', { consumerId });
	}

	async getChatDataProducerRemoteStats()
	{
		log.debug('getChatDataProducerRemoteStats()');

		const dataProducer = this._chatDataProducer;

		if (!dataProducer)
			return;

		return this._protoo.request(
			'getDataProducerStats', { dataProducerId: dataProducer.id });
	}

	async getBotDataProducerRemoteStats()
	{
		log.debug('getBotDataProducerRemoteStats()');

		const dataProducer = this._botDataProducer;

		if (!dataProducer)
			return;

		return this._protoo.request(
			'getDataProducerStats', { dataProducerId: dataProducer.id });
	}

	async getDataConsumerRemoteStats(dataConsumerId)
	{
		log.debug('getDataConsumerRemoteStats()');

		const dataConsumer = this._dataConsumers.get(dataConsumerId);

		if (!dataConsumer)
			return;

		return this._protoo.request('getDataConsumerStats', { dataConsumerId });
	}

	async getSendTransportLocalStats()
	{
		log.debug('getSendTransportLocalStats()');

		if (!this._send)
			return;

		return this._send.getStats();
	}

	async getRecvTransportLocalStats()
	{
		log.debug('getRecvTransportLocalStats()');

		if (!this._recv)
			return;

		return this._recv.getStats();
	}

	async getAudioLocalStats()
	{
		log.debug('getAudioLocalStats()');

		if (!this._micProducer)
			return;

		return this._micProducer.getStats();
	}

	async getVideoLocalStats()
	{
		log.debug('getVideoLocalStats()');

		const producer = this._webcamProducer || this._shareProducer;

		if (!producer)
			return;

		return producer.getStats();
	}

	async getConsumerLocalStats(consumerId)
	{
		const consumer = this._consumers.get(consumerId);

		if (!consumer)
			return;

		return consumer.getStats();
	}

	async applyNetworkThrottle({ uplink, downlink, rtt, secret, packetLoss })
	{
		log.debug(
			'applyNetworkThrottle() [uplink:%s, downlink:%s, rtt:%s, packetLoss:%s]',
			uplink, downlink, rtt, packetLoss);

		try
		{
			await this._protoo.request(
				'applyNetworkThrottle',
				{ secret, uplink, downlink, rtt, packetLoss });
		}
		catch (error)
		{
			log.error('applyNetworkThrottle() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error applying network throttle: ${error}`
			});
		}
	}

	async resetNetworkThrottle({ silent = false, secret })
	{
		log.debug('resetNetworkThrottle()');

		try
		{
			await this._protoo.request('resetNetworkThrottle', { secret });
		}
		catch (error)
		{
			if (!silent)
			{
				log.error('resetNetworkThrottle() | failed:%o', error);

				this.emit (EV.STATE.NOTIFY, {
					type : 'error',
					text : `Error resetting network throttle: ${error}`
				});
			}
		}
	}

	async _joinRoom() {
		this.emit (EV.STATE.CONNECTING);

		try {
			this._mediasoupDevice = new mediasoupClient.Device ({ handlerName : this._handlerName });

			this.emit (EV.CLIENT_HANDLER.CREATED, this._mediasoupDevice.handlerName);

			const routerRtpCapabilities = await this.#session.request (
				/* REQ ID         */ 'getRouterRtpCapabilities',
				/* DATA           */ null,
				/* TO COMPONENT   */ 'core',
				/* FROM COMPONENT */ null,
			);

			await this._mediasoupDevice.load ({ routerRtpCapabilities });

			// NOTE: Stuff to play remote audios due to browsers' new autoplay policy.
			//
			// Just get access to the mic and DO NOT close the mic track for a while.
			// Super hack!
			{
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				const audioTrack = stream.getAudioTracks()[0];

				audioTrack.enabled = false;

				setTimeout(() => audioTrack.stop(), 120000);
			}

			// Create mediasoup Transport for sending (unless we don't want to produce).
			if (this._produce)
				this._send = await WebRtcTransport.create (this, { type: 'producer' })

			// Create mediasoup Transport for receiving (unless we don't want to consume).
			if (this._consume)
				this._recv = await WebRtcTransport.create (this, { type: 'consumer' })


			// Join now into the room.
			// NOTE: Don't send our RTP capabilities if we don't want to consume.
			const { peers } = await this.#session.request (
				/* REQ ID         */ 'join',
				/* DATA           */ {
					displayName      : this._displayName,
					device           : this._device,
					rtpCapabilities  : this._consume && this._mediasoupDevice.rtpCapabilities,
					sctpCapabilities : this._useDataChannel && this._consume && this._mediasoupDevice.sctpCapabilities,
				},
				/* TO COMPONENT   */ 'core',
				/* FROM COMPONENT */ null,
			);

			this.emit (EV.STATE.CONNECTED);

			// Clean all the existing notifcations.
			this.emit (EV.REMOVEALLNOTIFICATIONS);

			this.emit (EV.STATE.NOTIFY, {
				text    : 'You are in the room!',
				timeout : 3000
			});

			for (const peer of peers)
				this.emit (EV.PEER.ADD, ({ ...peer, consumers: [], dataConsumers: [] }));

			// Enable mic/webcam.
			if (this._produce)
			{
				// Set our media capabilities.
				this.emit (EV.ME.SETMEDIACAPS, {
					canSendMic    : this._mediasoupDevice.canProduce ('audio'),
					canSendWebcam : this._mediasoupDevice.canProduce ('video')
				});

				this.enableMic ();

				const devicesCookie = cookiesManager.getDevices();

				if (!devicesCookie || devicesCookie.webcamEnabled || this._externalVideo)
					this.enableWebcam ();

				this._send.transport.on ('connectionstatechange', (connectionState) =>
				{
					log.debug ('[_send] connection state', connectionState);

					if (connectionState === 'connected') {
						// TODO
					}
				});
			}
		}
		catch (error)
		{
			log.error ('_joinRoom() failed:', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Could not join the room: ${error}`
			});

			this.close();
		}
	}

	async _updateWebcams()
	{
		log.debug('_updateWebcams()');

		// Reset the list.
		this._webcams = new Map();

		log.debug('_updateWebcams() | calling enumerateDevices()');

		const devices = await navigator.mediaDevices.enumerateDevices();

		for (const device of devices)
		{
			if (device.kind !== 'videoinput')
				continue;

			this._webcams.set(device.deviceId, device);
		}

		const array = Array.from(this._webcams.values());
		const len = array.length;
		const currentWebcamId =
			this._webcam.device ? this._webcam.device.deviceId : undefined;

		log.debug('_updateWebcams() [webcams:%o]', array);

		if (len === 0)
			this._webcam.device = null;
		else if (!this._webcams.has(currentWebcamId))
			this._webcam.device = array[0];

		this.emit (EV.ME.SETCANCHANGEWEBCAM, this._webcams.size > 1);
	}

	_getWebcamType(device)
	{
		if (/(back|rear)/i.test(device.label))
		{
			log.debug('_getWebcamType() | it seems to be a back camera');

			return 'back';
		}
		else
		{
			log.debug('_getWebcamType() | it seems to be a front camera');

			return 'front';
		}
	}

	async _pauseConsumer(consumer)
	{
		if (consumer.paused)
			return;

		try
		{
			await this._protoo.request('pauseConsumer', { consumerId: consumer.id });

			consumer.pause();

			store.dispatch(
				stateActions.setConsumerPaused(consumer.id, 'local'));
		}
		catch (error)
		{
			log.error('_pauseConsumer() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error pausing Consumer: ${error}`
			});
		}
	}

	async _resumeConsumer(consumer)
	{
		if (!consumer.paused)
			return;

		try
		{
			await this._protoo.request('resumeConsumer', { consumerId: consumer.id });

			consumer.resume();

			store.dispatch(
				stateActions.setConsumerResumed(consumer.id, 'local'));
		}
		catch (error)
		{
			log.error('_resumeConsumer() | failed:%o', error);

			this.emit (EV.STATE.NOTIFY, {
				type : 'error',
				text : `Error resuming Consumer: ${error}`
			});
		}
	}

	async _getExternalVideoStream()
	{
		if (this._externalVideoStream)
			return this._externalVideoStream;

		if (this._externalVideo.readyState < 3)
		{
			await new Promise((resolve) => {
				this._externalVideo.addEventListener('canplay', resolve)
			});

			log.debug ('------------- canplay fired -------')
		}

		if (this._externalVideo.captureStream)
			this._externalVideoStream = this._externalVideo.captureStream();
		else if (this._externalVideo.mozCaptureStream)
			this._externalVideoStream = this._externalVideo.mozCaptureStream();
		else
			throw new Error('video.captureStream() not supported');

		return this._externalVideoStream;
	}
}
