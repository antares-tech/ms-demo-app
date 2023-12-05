import Log                               from 'common/log';
import store                             from 'store';
import { Room }                          from '@antares-tech/ms-client';
import { setRoomState }                  from 'slices/room';
import { setRoomMediasoupClientHandler } from 'slices/room';
import { setUserAgent }                  from 'slices/me';
import { setMediaCapabilities }          from 'slices/me';
import { setWebcamInProgress }           from 'slices/me';
import { setCanChangeWebcam }            from 'slices/me';
import { addProducer }                   from 'slices/producers';
import { addConsumer }                   from 'slices/consumers';
import { removeConsumer }                from 'slices/consumers';
import { addPeer }                       from 'slices/peers';
import { removePeer }                    from 'slices/peers';
import { notify }                        from 'slices/notifications';
import { removeAllNotifications }        from 'slices/notifications';
import { addWebRtcTransport }            from 'slices/webrtc-transports';
import { setConnectionState }            from 'slices/webrtc-transports';
import { setICEGatheringState }          from 'slices/webrtc-transports';
import { setStats }                      from 'slices/webrtc-transports';

const log = new Log ('ev2redux');

class LinkEventsToRedux {
	static init (room) {
		const { State, ClientHandler, UserAgent, Peer, Producer, Consumer, WebRtcTransport } = Room.Events;

		this.#connectState (room);

		room.on (ClientHandler.Created,                (data) => store.dispatch (setRoomMediasoupClientHandler (data)));
		room.on (UserAgent.Info,                       (data) => store.dispatch (setUserAgent (data)));
		room.on (Peer.New,                             (data) => store.dispatch (addPeer (data)));
		room.on (Peer.Closed,                          (data) => store.dispatch (removePeer (data)));
		room.on (Producer.New,                         (data) => store.dispatch (addProducer (data)));
		room.on (Consumer.New,                         (data) => store.dispatch (addConsumer (data)));
		room.on (Consumer.Removed,                     (data) => store.dispatch (removeConsumer (data)));
		room.on (WebRtcTransport.ConnectionState,      (data) => store.dispatch (setConnectionState (data)));
		room.on (WebRtcTransport.IceGatherState,       (data) => store.dispatch (setICEGatheringState (data)));
		room.on (WebRtcTransport.Stats,                (data) => store.dispatch (setStats (data)));

		this.#connectAlerts (room);
	}

	static #connectState (room) {
		for (let key in Room.Events.State) {
			const ev    = Room.Events.State[key];
			const state = ev.split ('/')[2];

			room.on (ev, () => store.dispatch (setRoomState (state)));
		}
	}

	static #connectAlerts (room) {
		const { State, ClientHandler, Peer, Producer, Consumer, WebRtcTransport } = Room.Events;

		// Clear all notifications upon getting connected
		room.on (State.Connected,                     (name) => store.dispatch (removeAllNotifications ()));
		room.on (State.Connected,                     (    ) => this.#showAlert ('Joined the room'));
		room.on (ClientHandler.Created,               (name) => this.#showAlert (`Client Handler created "${name}"`, 'info', 10000));
		room.on (Peer.New,                            (data) => this.#showAlert (`New peer - ${data.displayName}`));
		room.on (Peer.Closed,                         (data) => this.#showAlert (`Peer removed - ${data.displayName}`));
		room.on (Producer.New,                        (data) => this.#showAlert (`New ${data.track.kind} from ${data.track.label}`));
		room.on (Consumer.New,                        (data) => this.#showAlert (`New consumer - ${data.peerVCID}/${data.type}`));
		room.on (Consumer.Removed,                    (data) => this.#showAlert (`consumer ${data.consumer.id} (VCID : ${data.consumer.appData.peerVCID}) deleted : ${data.reason || 'no reason'}`, 'warning'));
		room.on (WebRtcTransport.IceGatherState,      (data) => this.#showAlert (`[${data.type}] ICE Gathering State => ${data.iceGatheringState}`));
		room.on (WebRtcTransport.ConnectionState,     (data) => this.#showAlert (`[${data.type}] Connection state => ${data.connectionState}`));
	}

	static #showAlert (message, type = 'info', timeout = 3000) {
		store.dispatch (notify ({
			message, type, timeout
		}));
	}
}

export default LinkEventsToRedux;
