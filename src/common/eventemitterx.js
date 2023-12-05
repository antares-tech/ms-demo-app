import EventEmitter from 'eventemitter2';
import Log          from 'common/log';

const log = new Log ('eventemitterX');

export default class EventEmitterX extends EventEmitter {
	#storePastEvents = false;
	#windowSize = 0;
	#pastEvents = null

	constructor (opts) {
		super (opts);

		const { pastEvents } = opts;
		const { windowSize } = pastEvents || {};

		if (windowSize) {
			this.#storePastEvents = true;
			this.#windowSize      = windowSize;
			this.#pastEvents      = [];
		}
	}

	emit (ev, ...args) {
		super.emit (ev, ...args);

		// Store events in the history for newer
		// subscribers

		if (this.#storePastEvents) {
			this.#pastEvents.push ({ ev, data : Array.from (args) });

			// Store only last 'windowSize' number of events. Loose older ones

			if (this.#pastEvents.length + 1 >= this.#windowSize)
				this.#pastEvents.shift ();
		}
	}

	on (ev, handler) {
		super.on (ev, handler);

		// if there are any past instances of any events
		// then emit them for this new subscriber

		if (this.#storePastEvents) {
			const pastEvents = this.#pastEvents.filter (c => c.ev === ev);

			for (const pastEv of pastEvents)
				super.emit (ev, ...pastEv.data);
		}
	}
}
