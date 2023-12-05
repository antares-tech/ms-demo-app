import jsCookie from 'js-cookie';
import Log      from 'common/log';

const log = new Log ('cookies-mgr');
const USER_COOKIE = 'mediasoup-demo.user';
const DEVICES_COOKIE = 'mediasoup-demo.devices';

export function getUser()
{
	return jsCookie.getJSON(USER_COOKIE);
}

export function setUser({ displayName })
{
	log.debug ('setting', USER_COOKIE, '=', { displayName });
	jsCookie.set(USER_COOKIE, { displayName });
}

export function getDevices()
{
	return jsCookie.getJSON(DEVICES_COOKIE);
}

export function setDevices({ webcamEnabled })
{
	log.debug ('setting', DEVICES_COOKIE, '=', { webcamEnabled });
	jsCookie.set(DEVICES_COOKIE, { webcamEnabled });
}
