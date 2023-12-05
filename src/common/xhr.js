import axios from 'axios';

class xhr {

	static async get (url, options) {
		try {
			const output = await axios.get (url, options);
			return output.data;
		}
		catch (e) {
			throw this.handleError (e);
		}
	}

	static async post (url, data, options) {
		try {
			const output = await axios.post (url, data, options);
			return output.data;
		}
		catch (e) {
			throw this.handleError (e);
		}
	}

	static async put (url, data, options) {
		try {
			const output = await axios.put (url, data, options);
			return output.data;
		}
		catch (e) {
			throw this.handleError (e);
		}
	}

	static async delete (url, data, options) {
		try {
			const output = await axios.delete (url, data, options);
			return output.data;
		}
		catch (e) {
			throw this.handleError (e);
		}
	}

	static handleError (err) {
		let statusText = (err.response && err.response.statusText) ? `${err.response.statusText} : ` : '';
		let message    = (err.response && err.response.data) ||'';

		if (err.message === 'Network Error') {
			message = 'Network Error';
		}

		return new Error (`${statusText}${message}`);
	}

}

export default xhr;
