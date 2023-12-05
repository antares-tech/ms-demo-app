import Address from './address';

class PDU {
	static seq = Math.ceil ((Math.random () * 1000));

	constructor ({ from, to, type, id, status, data, seq }) {
		const _from = from && (from instanceof Address ? from: new Address (from));
		const _to   = to   && (to   instanceof Address ? to  : new Address (to));

		if ((type === 'ack') && (typeof seq === 'undefined'))
			throw new Error ('ack pdu needs a sequence number');

		if (typeof seq === 'string')
			seq = parseInt (seq);

		this.v          = 1;
		this.seq        = typeof seq !== 'undefined' ? seq : PDU.seq++;
		this.type       = type;
		this.id         = id
		this.to         = _to;
		this.from       = _from;
		this._transport = null;

		switch (type) {
			case 'ping':
			case 'pong':
				break;
			case 'ack':
				this.status = status;
				// fall through
			case 'auth':
			case 'req':
			case 'info':
				this.data = data;
				break;
			default:
				throw new Error (`illegal message type "${type}"`);
		}
	}

	serialize () {
		return JSON.stringify (this.toJSON ());
	}

	toString () {
		return this.serialize ();
	}

	toJSON () {
		return {
			v     : this.v,
			seq   : this.seq,
			type  : this.type,
			id    : this.id,
			to    : this.to?.serialize (),
			from  : this.from?.serialize (),
			data  : this.data,
			status: this.status,
		};
	}

	static parse (e) {
		const message = JSON.parse (e); 
		const { v, type, to, from, status, id, data, seq } = message;

		if (v !== 1)
			throw new Error ('illegal protocol v');

		if ((type !== 'auth') &&
			(type !== 'req') &&
			(type !== 'info') &&
			(type !== 'ping') &&
			(type !== 'pong') &&
			(type !== 'ack'))
			throw new Error ('illegal protocol message type');

		if (type !== 'pong' && type !== 'ping')
			if (!to || !from)
				throw new Error ('illegal protocol (from/to) address');

		if ((type === 'pong') || (type === 'ping'))
			return new PDU ({ from, to, type, id, seq });

		if (type === 'ack')
			return new PDU ({ from, to, type, id, status, data, seq });

		//
		// The message is either req | info | auth
		//
		return new PDU ({ from, to, type, id, data, seq });
	}

	summary (dir) {
		let error = false;

		/* Don't clutter up the console ... 
		*/
		if (this.type === 'ping' || 
			this.type === 'pong'
		)
			return;

		switch (this.type) {
			case 'ack':
				error = this.status === 'not-ok';
				// Fall Through

			case 'auth':
			case 'req':
			case 'info':
				break;

			default:
				throw new Error (`unknown packet type: "${this.type}"`);
		}

		if (this.type === 'ping' ||
			this.type === 'pong') {
			console.debug(`%c${dir}%c: v${this.v} ${this.type}.${this.seq} (%c${this.from.serialize ()} -> ${this.to.serialize ()}%c)`, 
				`color:orange;background:${error ? 'red' : 'initial'}`,
				'color:init',
				'color:orange',
				'color:init'
			);
			return;
		}

		switch (dir) {
			case 'RX': dir = 'RX <<'; break;
			case 'TX': dir = 'TX >>'; break;
			default:
				throw new Error (`unknown packet dir: "${dir}"`);
		}

		console.debug (`%c${dir}%c %c${this.type}%c.${this.seq} %c${this.id}%c %c${this.status ? this.status + '%c ' : '%c'}(%c${this.from.serialize ()} -> ${this.to.serialize ()}%c)`, 
			// for dir
			`color:${error ? 'red': 'orange'}`,
			'color:init',
			// for type
			`color:${error ? 'red': 'orange'};font-weight:bold;font-size:larger;`,
			'color:init',
			// for id
			'color:cyan;font-weight:bold;font-size:larger;',
			'color:init',
			// for status
			`color:${error ? 'white' : 'cyan'};background-color:${error ? 'red': 'init'};`,
			'color:init',
			// for from-to
			'color:orange;font-size:smaller',
			'color:init',
			this.data
		);
	}
}

class RequestPDU extends PDU {
	constructor (from, to, id, data) {
		super ({ from, to, type: 'req', id, data });
	}
}

class InfoPDU extends PDU {
	constructor (from, to, id, data) {
		super ({ from, to, type: 'info', id, data });
	}
}

class Auth extends RequestPDU {
	constructor (data) {
		super ('-pre-auth', 'auth', 'authenticate-me', data);
	}
}

class PingPDU extends PDU {
	constructor (id) {
		super ({ from: `user:${id}`, to: 'controller', type: 'ping' });
	}
}

class AckPDU extends PDU {
	constructor (pdu, status, data) {
		super ({
			seq     : pdu.seq,
			from    : pdu.to,
			to      : pdu.from,
			type    : 'ack',
			id      : pdu.id,
			status,
			data,
		});
	}
}

const Protocol = {
	PDU,
	Auth,
	RequestPDU,
	InfoPDU,
	AckPDU,
	PingPDU,
};

export default Protocol;
