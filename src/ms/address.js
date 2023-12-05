class Address {
	#entity
	#comp

	constructor (addrStr) {
		let _a    = addrStr.split('.');
		let _ep   = _a[0].split(':');
		let _comp = _a[1] && _a[1].split(':') || null;

		this.#entity = {
			type : _ep[0],
			id   : _ep[1] || '0'
		};

		if (_comp) {
			this.#comp = {
				type : _comp[0],
				id   : _comp[1] || '0'
			};
		}
	}

	static make (obj) {
		if (!obj.entity) {
			throw new Error ('illegal input for Address.make');
		}

		let s = `${obj.entity.type}:${obj.entity.id || '0'}`;

		if (obj.comp) {
			s += `.${obj.comp.type}:${obj.comp.id || '0'}`;
		}

		return new Address (s);
	}

	get entityType () { return this.#entity.type; }
	get entityId ()   { return this.#entity.id; }
	get compType ()   { return this.#comp && this.#comp.type; }
	get compId ()     { return this.#comp && this.#comp.id; }
	get VCID ()       { return this.entityType === 'user' ? this.entityId : null; }

	serialize () {
		return this.toString();
	}

	toString () {
		let s = `${this.#entity.type}:${this.#entity.id}`;

		if (this.#comp) {
			s += `.${this.#comp.type}:${this.#comp.id}`;
		}

		return s;
	}
}

export default Address;
