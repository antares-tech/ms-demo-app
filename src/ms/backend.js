import Log          from 'common/log';
import xhr          from 'common/xhr';

const log = new Log ('backend');

class Backend {
	static urlPrefix;
	static init ({ proto, host, port }) {
		Backend.urlPrefix = port ? `${proto}://${host}:${port}/ms/landing` : `${proto}://${host}/ms/landing` ;
	}

	static async createRoom (opts = {}) {
		const { id, type } = opts;

		if (!id)
			throw new Error ('insufficient arguments');

		const url = `${Backend.urlPrefix}/room/${id}/create`;

		const { server, room } = await xhr.post (url, { type });

		return { server, room };
	}

	static async getCredentials ({ identity, roomInfo }) {
		if (!identity ||
			!identity.id ||
			!identity.displayName ||
			!roomInfo ||
			!roomInfo.id
		)
			throw new Error ('insufficient arguments');

		const url  = `${Backend.urlPrefix}/auth/credentials/room/${roomInfo.id}`;
		const cred = await xhr.post (url, identity);

		log.debug ('getCredentials: response =', cred);

		return cred;
	}

}

export default Backend;
