const levels = [ 'error', 'warn', 'info', 'debug' ];
const start  = new Date ();
let ts = start; //eslint-disable-line

class Log {
	constructor (prefix, level = 'debug') {
		this._prefix = prefix;
		this._level  = levels.indexOf(level);

		if (this._level === -1)
			throw new Error (`unrecognized log level "${level}"`);
	}

	debug () {
		if (this._level < levels.indexOf ('debug'))
			return;

		let timeStr = this._format (this._deltaTS ());
		console.log (`%c${timeStr} [${this._prefix}]`, 'color:gray', ...arguments);
	}

	info () {
		if (this._level < levels.indexOf ('info'))
			return;

		let timeStr = this._format (this._deltaTS ());
		console.log (`${timeStr} [${this._prefix}]`, ...arguments);
	}

	warn () {
		if (this._level < levels.indexOf ('warn'))
			return;

		let timeStr = this._format (this._deltaTS ());
		console.warn (`${timeStr} [${this._prefix}]`, ...arguments);
	}

	error () {
		if (this._level < levels.indexOf ('info'))
			return;

		let timeStr = this._format (this._deltaTS ());
		console.error (`${timeStr} [${this._prefix}]`, ...arguments);
	}

	_deltaTS () {
		let now  = new Date ();
		let diff = now.valueOf () - start.valueOf ();

		ts  = now;

		return diff;
	}

	_format (durationMS) {
		let durationSecs = Math.floor (durationMS/1000);
		let hours        = Math.floor (durationSecs / 3600);
		let minutes      = Math.floor((durationSecs - (hours * 3600)) / 60);
		let seconds      = durationSecs - (hours * 3600) - (minutes * 60);
		let millisecs    = durationMS % 1000;

		let hoursS = hours <= 0 ? '' : `${hours}`.padStart (2, '0') + ':';
		let minsS  = `${minutes}`.padStart (2, '0') + ':';
		let secsS  = `${seconds}`.padStart (2, '0') + ':';
		let msS    = `${millisecs}`.padStart (3, '0');

		return `${hoursS}${minsS}${secsS}${msS}`;
	}
}

export default Log;
