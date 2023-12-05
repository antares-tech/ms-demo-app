/* eslint no-throw-literal : "off" */

import EventEmitter from 'eventemitter2';
import Protocol     from './protocol';
import Log          from 'common/log';

const log = new Log ('transport');

const wsErrorCodes =  {
	'1000' :  { codeName : 'CLOSE_NORMAL',            description : 'Regular socket shutdown' },
	'1001' :  { codeName : 'CLOSE_GOING_AWAY',        description : 'Client is leaving (browser tab closing)' },
	'1002' :  { codeName : 'CLOSE_PROTOCOL_ERROR',    description : 'Endpoint received a malformed frame' },
	'1003' :  { codeName : 'CLOSE_UNSUPPORTED',       description : 'Endpoint received an unsupported frame (e.g. binary-only endpoint received text frame)' },
	'1004' :  { codeName : 'Reserved1004',            description : 'Reserved' },
	'1005' :  { codeName : 'CLOSED_NO_STATUS',        description : 'Expected close status, received none' },
	'1006' :  { codeName : 'CLOSE_ABNORMAL',          description : 'No close code frame has been received' },
	'1007' :  { codeName : 'Unsupported payload',     description : 'Endpoint received inconsistent message (e.g. malformed UTF-8)' },
	'1008' :  { codeName : 'Policy violation',        description : 'Generic code used for situations other than 1003 and 1009' },
	'1009' :  { codeName : 'CLOSE_TOO_LARGE',         description : 'Endpoint will not process large frame' },
	'1010' :  { codeName : 'Mandatory extension',     description : 'Client wanted an extension which server did not negotiate' },
	'1011' :  { codeName : 'Server error',            description : 'Internal server error while operating' },
	'1012' :  { codeName : 'Service restart',         description : 'Server/service is restarting' },
	'1013' :  { codeName : 'Try again later',         description : 'Temporary server condition forced blocking client\'s request' },
	'1014' :  { codeName : 'Bad gateway',             description : 'Server acting as gateway received an invalid response' },
	'1015' :  { codeName : 'TLS handshake fail',      description : 'Transport Layer Security handshake failure' },
	/*
	 * App specific codes
	 */
	'4000' :  { codeName : 'CLOSED_BY_SERVER',        description : 'Normal Closure by Server' },
	'4001' :  { codeName : 'INACTIVITY_TIMEOUT',      description : 'Missed a few pongs too many' },
	'4002' :  { codeName : 'CLOSED_BY_APP',           description : 'Normal Closure by App' },
	'4003' :  { codeName : 'DUPLICATE_CONN',          description : 'Closure by server due to Duplicate connection detection' },
};
const PING_TRIGGER_INTERVAL_MS                = 5 * 1000; // 5 secconds
const SOCK_NOT_RESPONDING_TRIGGER_INTERVAL_MS = 6 * PING_TRIGGER_INTERVAL_MS;
const DEFAULT_MARGIN_MS                       = 1 * 1000; // 1 secconds

class Transport extends EventEmitter {
	#host
	#port
	#proto

	#VCID
	#shuttingDown
	#sockError
	#lastRXTs
	#lastTXTs
	#pingTimer
	#pingConfig
	#socket
	#missedPongs
	#lastPingAcked
	#msgQ

	constructor ({ host, port, proto }) {
		super ();

		if (!host)
			throw new Error ('"host" not provided');

		this.#host           = host;
		this.#port           = port ?? 443;
		this.#proto          = proto ?? 'wss';
		this.#sockError      = null;

		/* Internal properties */
		this.#msgQ             = {};
		this.#missedPongs      = 0;
		this.#lastPingAcked    = -1;
		this.#shuttingDown     = false;
	}

	get VCID ()        { return this.#VCID; }
	set VCID (v)       { this.#VCID = v; }
	set pingConfig (p) { this.#pingConfig = p; }

	connect (path) {
		const url = `${this.#proto}://${this.#host}:${this.#port}${path}`;

		const promise = new Promise ((resolve, reject) => {

			try {
				this.#socket = new WebSocket (url/*, {
						handshakeTimeout : 5000,
						rejectUnauthorized: false
				}*/);
			}
			catch (e) {
				log.error ('WebSocket creation error : ', e);
				return reject (e);
			}

			this.#socket.onopen = () => {
				this.#lastRXTs = new Date ();
				this.startPingPong ();
				resolve ();
			}; 

			this.#socket.onerror = (ev) => {
				this.#sockError = ev;
				this.emit ('transport/error', { event : 'error', data  : ev });
			};

			this.#socket.onclose = ({ code, reason, wasClean }) => {
				const description = wsErrorCodes[code]?.description || 'unknown reason';

				if (!reason || !reason.length) {
					reason = description;
				}

				log.warn ('transport closed: reason =', description);

				if (this.#sockError && !this.#shuttingDown) {
					reject (description);
				}

				this.stopPingPong ();
				this.#socket = null;

				if (!this.#shuttingDown)
					this.emit ('transport/closed', { event : 'closed', code, reason, wasClean });
			};

			this.#socket.onmessage = (ev) => {
				this.incoming (ev);
			};
		});

		promise.catch (() => { /* catcher */ });

		return promise;
	}

	shutdown (options = {}) {
		const { code, reason } = options;

		this.#shuttingDown = true;

		if (this.#socket) {
			this.emit ('transport/shutdown', { event : 'shutdown', code, reason });
			this.#socket.close (code, reason);
			this.#socket.onopen    = () => {};
			this.#socket.onerror   = () => {};
			this.#socket.onclose   = () => {};
			this.#socket.onmessage = () => {};
			this.#socket = null;
		}

		log.debug ('shutdown complete');
	}

	on (fqEvent, handler) {
		const _s        = fqEvent.split('/');
		const qualifier = _s[0];

		switch (qualifier) {
			case 'req':
				return this.#onReq (fqEvent, handler);

			case 'info':
			case 'transport':
				return super.on (fqEvent, handler);

			default:
				throw new Error (`unknown event qualifier "${qualifier}" for event "${fqEvent}"`);
		}
	}

	#onReq (fqEvent, handler) {
		const listeners = this.listeners (fqEvent);

		if (listeners.length > 0)
			throw new Error (`cannot add more listeners for request "${fqEvent}"`);

		return super.on (fqEvent, (data) => handler (data), { objectify: true });
	}


	//
	// This method is not used
	//
	async authenticate (credentials) {
		const pdu = new Protocol.Auth (credentials);

		pdu.summary ('TX');

		const response = await this.send (pdu, true);
		const { identity, clock, pingConfig } = response;

		this.#lastRXTs   = new Date ();
		this.#VCID       = identity.VCID;
		this.#pingConfig = pingConfig;

		return response;
	}

	request (to, command, data, from) {
		const pdu = new Protocol.RequestPDU (from, to, command, data);
		pdu.summary ('TX');

		return this.send (pdu, true);
	}

	info (to, id, data, from) {
		const pdu  = new Protocol.InfoPDU (from, to, id, data);

		if (id !== 'log')
			pdu.summary ('TX');

		return this.send (pdu, false);
	}

	send (pdu, ack) {
		return new Promise ((resolve, reject) => {
			try {
				if (!this.#socket) {
					throw new Error ('socket not available');
				}

				if (ack) {
					/*
					 * If an ACk is required then create and store
					 * a deferred, indexed by the sequence number of
					 * the message */
					const seq = pdu.seq.toString ();

					this.#msgQ[seq] = {};
					this.#msgQ[seq].promise = {
						resolve : resolve,
						reject  : reject
					};
				}

				/*
				 * The socket.send does not throw any exception if the socket is closed (bad api). */
				if (this.#socket.readyState !== 1) {
					throw new Error ('socket unavailable : state = ' + this.#socket.readyState);
				}

				this.#socket.send (pdu.serialize ());
				this.#lastTXTs = new Date ();

				if (!ack) {
					resolve ();
				}
			}
			catch (err) {
				if (!this.#shuttingDown) {
					reject (err);
				}
			}
		});
	}

	terminate (code) {
		if (!code) {
			code = 1000;
		}

		if (this.#socket) {
			this.#socket.close ({ code : code });
		}
	}

	#processAck (pdu) {
		const seq  = pdu.seq.toString ();
		const { data, status } = pdu;

		if (!this.#msgQ[seq] || !this.#msgQ[seq].promise) {
			log.error ('RX: ACK: seq (' + seq + ') does not exist: pdu = ', pdu);
			return;
		}

		const promise = this.#msgQ[seq].promise;

		if (!promise) {
			log.error ('warning : stray ACK recieved. ignoring.', pdu);
			return;
		}

		switch (status) {
			case 'ok':
				promise.resolve (data);
			break;

			case 'not-ok':
			case 'error':
				if (!this.#shuttingDown) {
					promise.reject (data);
				}
			break;

			default :
				log.error ('RX: ACK: illegal status (' + status + '): pdu = ', pdu);
				if (!this.#shuttingDown) {
					promise.reject (data);
				}
			break;
		}

		delete this.#msgQ[seq];
	}

	incoming (ev) {
		try {
			this.#lastRXTs = new Date ();

			const pdu = Protocol.PDU.parse (ev.data);
			pdu.summary ('RX');

			/*
			 * If the pdu is a 'pong' break off early before all other
			 * checks follow */

			if (pdu.type === 'pong') {
				return this.processPong (pdu);
			}

			/*
			 * remove the 'user:xxx', since no-one downstream needs to 
			 * know that
			   pdu.to = pdu.to.replace(/^user:[^.]+\./, '');
			*/

			switch (pdu.type) {

				case 'ack' : 
					this.#processAck (pdu); 
					break;

				case 'info' : 
					this.handleInfo (pdu);
					break;

				case 'req' : 
					this.handleReq (pdu); 
					break;

				default : 
					log.error ('RX: illegal type (' + pdu.type + '): pdu =', pdu);
			}
		}
		catch (ex) {
			log.error ('incoming : protocol error = ', ex);
			return;
		}

		return;
	}

	async handleInfo (pdu) {
		const fqEvent      = `info/${pdu.id}`;
		const numListeners = this.listeners (fqEvent).length;

		if (!numListeners)
			log.warn (`no listeners for event "${fqEvent}"`);

		try {
			this.emit (`info/${pdu.id}`, {
				from   : pdu.from,
				to     : pdu.to,
				id     : pdu.id,
				data   : pdu.data,
				pdu,
			});
		}
		catch (err) {
			log.error (`error handling event "${fqEvent}":`, err);
		}
	}

	async handleReq (pdu) {
		const fqEvent      = `req/${pdu.id}`;
		const numListeners = this.listeners (fqEvent).length;

		try {
			if (numListeners <= 0)
				throw new Error (`no listeners for request "${pdu.id}"`);

			if (numListeners > 1)
				throw new Error (`too many listeners for request "${pdu.id}"`);

			const responseArr = await this.emitAsync (fqEvent, {
				from    : pdu.from,
				to      : pdu.to,
				id      : pdu.id,
				data    : pdu.data,
				pdu
			});

			if (responseArr.length !== 1)
				throw new Error (`invalid response count "${responseArr.length}" - expected 1`);

			this.ack (pdu, 'ok', responseArr[0]);
		}
		catch (err) {
			this.ack (pdu, 'not-ok', err.message || err);
		}
	}

	async ack (pdu, status, data) {

		try {
			const ackPdu = new Protocol.AckPDU (pdu, status, data);
			ackPdu.summary ('TX');
			await this.send (ackPdu);
		}
		catch (err) {
			log.error ('ack failed : reason : ', err, pdu, status, data);
		}
	}

	/*
	 * Ping/Pong related routines
	*/

	startPingPong () {
		const { intervals } = this.#pingConfig || {};
		const { pingTrigger } = intervals || {};

		this.#missedPongs = 0;
		this.#pingTimer   = setInterval (() => this.pingCheck (), pingTrigger || PING_TRIGGER_INTERVAL_MS);
	}

	stopPingPong () {
		clearInterval (this.#pingTimer);
	}

	async pingCheck () {
		const { intervals = {} } = this.#pingConfig || {};
		let { 
			sockUnresponsiveTrigger = SOCK_NOT_RESPONDING_TRIGGER_INTERVAL_MS, 
			margin                  = DEFAULT_MARGIN_MS 
			} = intervals;

		const now = new Date ();
		const RXInactivityTime = now - this.#lastRXTs;
		const TXInactivityTime = now - this.#lastTXTs;

		try {
			await this.sendPing ({ TXInactivityTime, margin, PING_TRIGGER_INTERVAL_MS });
			await this.checkInboundInactivity ({ RXInactivityTime, sockUnresponsiveTrigger });
		}
		catch (err) {
			log.error ('WebSocket connection lost : reason : ', err);

			clearInterval (this.#pingTimer);

			/*
			 * Try to return a proper ev to the close call
			*/
			const code   = err.code || '4001';
			const reason = wsErrorCodes[code]?.description || err.message || 'unknown reason';

			log.debug ('disconnected', code, reason);
			this.emit ('transport/disconnected', { code, reason });
			this.#socket.close (code, reason);
		}
	}

	async sendPing ({ TXInactivityTime, margin, pingTrigger }) {
		if (TXInactivityTime + margin < pingTrigger) {
			return;
		}

		const pdu = new Protocol.PingPDU (this.#VCID);
		await this.send (pdu);
		pdu.summary ('TX');
	}

	async checkInboundInactivity ({ RXInactivityTime, sockUnresponsiveTrigger }) {
		// If the last message we recieved from the switch is older
		// than "sockUnresponsiveTrigger", then consider this connection
		// as dead and close the socket

		if (RXInactivityTime >= sockUnresponsiveTrigger) {
			log.error (`RXInactivityTime (${RXInactivityTime}) >= sockUnresponsiveTrigger (${sockUnresponsiveTrigger}) : prolonged inactivity on the socket`);
			throw { code : '4000' };
		}
	}

	processPong (pdu) {
		this.#lastPingAcked = pdu.seq;
		this.#missedPongs    = 0;
	}
}

export default Transport;
