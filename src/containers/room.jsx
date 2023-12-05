/* eslint no-unused-vars : "off" */
import React, {
	useEffect,
	useState,
}                                   from 'react';
import { useHistory }               from 'react-router-dom';
import { useParams }                from 'react-router-dom';
import { useLocation }              from 'react-router-dom';
import { useSelector }              from 'react-redux';
import randomString                 from 'random-string';
import Log                          from 'common/log';
import { Typography }               from 'antd';
import Alert                        from 'containers/alerts';
import {
	Backend,
	Session,
	Room
}                                   from '@antares-tech/ms-client';
import LocalWidgets                 from 'containers/local-widgets';
import RemoteWidgets                from 'containers/remote-widgets';
import PeersWidget                  from 'containers/peers-widget';
import TransportWidget              from 'containers/transport-widget';
import LinkEventsToRedux            from 'containers/event-to-redux';
import store                        from 'store';
import { setIdentity }              from 'slices/me';
import { addWebRtcTransport }       from 'slices/webrtc-transports';

const log = new Log ('room', 'debug');
const { Text } = Typography;

export default function RoomContainer (props) {
	const history                 = useHistory ();
	const { search }              = useLocation ();
	const { roomId }              = useParams ();
	const [ init, setInit ]       = useState (false);
	const [ session, setSession ] = useState (false);
	const [ error, setError ]     = useState (null);

	const identity                = useSelector ((state) => state.me);
	const notifications           = useSelector ((state) => state.notifications.list);
	const roomState               = useSelector ((state) => state.room.state);
	const clientHandler           = useSelector ((state) => state.room.mediasoupClientHandler);
	const localDevices            = useSelector ((state) => state.localDevices.map);
	const localDevicesCounter     = useSelector ((state) => state.localDevices.counter);

	const urlSearchParams = new URLSearchParams (search);
	const peerId          = urlSearchParams.get ('peerId') || randomString ({ length: 8 }).toLowerCase ();

	const msLandingHost = urlSearchParams.get ('ms');
	const hostname      = msLandingHost && msLandingHost.split (':')[0];
	const _port         = msLandingHost && msLandingHost.split (':')[1] || 443;

	const me = {
		id          : peerId,
		displayName : `DisplayName=${peerId}`,
	};

	useEffect (() => {
		if (!roomId || !roomId.length) {
			log.debug ('no roomId specified - going back to the first screen');
			return history.push (`/?ms=${msLandingHost ? msLandingHost : ''}`);
		}

		if (!msLandingHost || !msLandingHost.length) {
			log.debug ('no MS Landing Host specified - going back to the first screen');
			return history.push (`/?room=${roomId ? roomId : ''}`);
		}

		if (!Object.keys (localDevices).length) {
			log.debug ('no devices selected - going to device selection screen');
			return history.push (`/room/${roomId}/sd${search}`);
		}
	}, []);

	useEffect (() => {
		if (init)
			return;

		setInit (true);
		store.dispatch (setIdentity (me));
	}, []);

	useEffect (() => {
		if (!init)
			return;

		(async () => {
			try {
				// Will usually be called by the server
				Backend.init ({
					host : hostname,
					port : _port,
					proto: 'https',
				});

				const { server, room:roomInfo } = await Backend.createRoom ({
					id   : roomId,
					type : Room.Types.ConferenceRoom,

					// Local options
					produce : true,
					consume : true,
				});

				const cred = await Backend.getCredentials ({ identity: me, roomInfo });

				// (end of) Will usually be called by the server

				const _session = new Session ({ msi : server, roomInfo });
				const { room } = _session;

				LinkEventsToRedux.init (room);

				await _session.connect (cred);
				const response = await _session.authenticate (cred);

				store.dispatch (setIdentity (response.identity));

				await room.init ();
				await room.createSendTransport ({ statsInterval: 1000 });
				await room.createRecvTransport ({ statsInterval: 1000 });
				await room.join ();

				setSession (_session);
				store.dispatch (addWebRtcTransport (room.sender.toJSON ()));
				store.dispatch (addWebRtcTransport (room.recver.toJSON ()));
			}
			catch (err) {
				setError (err.message || err);
				log.error ('session creation or join error:', err);
			}

		}) ()
	}, [  init ]);

	useEffect (() => {
		if (!session || !session.room || !identity.id)
			return;

		(async () => {
			try {
				for (const id in localDevices) {
					const { track, streamId } = localDevices[id];

					await session.room.addProducer (
						track,
						{
							// appData
							id          : identity.id,
							VCID        : identity.VCID,
							displayName : identity.displayName,
							streamId,
						}
					);
				}
			}
			catch (err) {
				setError (err.message || err);
				log.error ('Adding producer failed:', err);
			}

		}) ();

	}, [ session, localDevicesCounter, identity ]);

	return (
		<div className="main">
			<div className='alert-outer'>
				{  notifications.map ((curr, index) =>
						<Alert
							key={`notif-${index}`}
							msg={curr}
						/>
					)
				}
			</div>

			<Text>Client Handler = {clientHandler}.</Text>
			<Text>Room {roomId} ({roomState})</Text>

			{ error !== null && <Text type="danger"> { error } </Text> }

			<PeersWidget />
			<TransportWidget />
			<LocalWidgets />
			<RemoteWidgets />
		</div>
	);
}
