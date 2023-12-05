import EventEmitter from 'eventemitter2';
import Log          from 'common/log';
import xhr          from 'common/xhr';
import Transport    from './transport';
import Room         from './room';

const log = new Log ('session');

class Session {
	#cred
	#room
	#transport
	#emitterReq
	#VCID
	#displayName

	get room ()        { return this.#room; }
	get VCID ()        { return this.#VCID; }
	get displayName () { return this.#displayName; }

	constructor ({ msi, roomInfo }) {
		if (!msi || !roomInfo)
			throw new Error ('insufficient params : "msLanding" missing');

		const { proto, host, port } = msi;
		const { id, url, type, clientCaps, creationTS } = roomInfo;

		this.#transport   = new Transport ({ host, port, proto });
		this.#room        = new Room ({
			session: this,
			id,
			url,
			type,
			clientCaps,
			creationTS,
			emitterOpts : {
				pastEvents : {
					windowSize : 10,
				}
			}
		});
		this.#emitterReq  = new EventEmitter ({ wildcard: false });
	}

	async connect (cred) {
		if (!cred.secret)
			throw new Error ('secret credentials not found');

		const roomUrl = this.#room.url;
		const path    = `${roomUrl}?cred=${encodeURIComponent (cred.secret)}`;

		this.#listenToTransport ();
		await this.#transport.connect (path);
	}

	async authenticate (cred) {
		const response = await this.#transport.request (
			/* TO   */ 'room.auth',
			/* ID   */ 'authenticate-me',
			/* DATA */ cred,
			/* FROM */ '-pre-auth'
		);

		const { identity, pingConfig } = response;
		this.#VCID                     = identity.VCID;
		this.#transport.VCID           = identity.VCID;
		this.#displayName              = identity.displayName;
		this.#transport.pingConfig     = pingConfig;

		return response;
	}

	async disconnect () {
		throw new Error ('** To be implemented => disconnect **');
	}

	request (reqId, data = {}, to, from) {
		const toEntity   = `room:${this.#room.id}`;
		const fromEntity = `peer:${this.#VCID}`;

		const _to   = to   ? `${toEntity}.${to}` : toEntity;
		const _from = from ? `${fromEntity}.${from}` : fromEntity;

		return this.#transport.request (_to, reqId, data, _from);
	}

	info (infoId, data = {}, to, from) {
		const toEntity   = `room:${this.#room.id}`;
		const fromEntity = `peer:${this.#VCID}`;

		const _to   = to   ? `${toEntity}.${to}` : toEntity;
		const _from = from ? `${fromEntity}.${from}` : fromEntity;

		return this.#transport.info (_to, infoId, data, _from);
	}


	on (fqEvent, handler) {
		const _s        = fqEvent.split('/');
		const qualifier = _s[0];

		switch (qualifier) {
			case 'info':
			case 'req':
			case 'transport':
				return this.#transport.on (fqEvent, handler);

			case 'room':
				return this.#room.on (fqEvent, handler);

			default:
				throw new Error (`unknown event qualifier "${qualifier}" for event "${fqEvent}"`);
		}
	}

	#listenToRoom () {
	}

	#listenToTransport () {
		this.on ('transport/closed',       (data) => log.error ('no handler for transport close', data));
		this.on ('transport/disconnected', (data) => log.error ('no handler for transport disconnected', data));
	}
}

export default Session;
