import { configureStore }  from '@reduxjs/toolkit';
import RoomReducer         from 'slices/room';
import MeReducer           from 'slices/me';
import NotificationReducer from 'slices/notifications';
import ProducersReducer    from 'slices/producers';
import PeerReducer         from 'slices/peers';
import ConsumerReducer     from 'slices/consumers';
import LocalDevices        from 'slices/local-devices';
import WebRtcTransport     from 'slices/webrtc-transports';

export default configureStore({
	reducer: {
		room             : RoomReducer,
		me               : MeReducer,
		notifications    : NotificationReducer,
		producers        : ProducersReducer,
		peers            : PeerReducer,
		consumers        : ConsumerReducer,
		localDevices     : LocalDevices,
		webRtcTransports : WebRtcTransport,
	},

	// To supress warnings
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware ({
			serializableCheck: {

				// Ignore these action types
				ignoredActions: [ 'localDevices/addTrack' ],

				// Ignore these field paths in all actions
				ignoredActionPaths: [
					'payload.track',
					'payload.localDevices.addTrack',
					'payload.report'
				],

				// Ignore these paths in the state
				ignoredPaths: [
					/producers.arr..*.track/,
					/consumers.arr..*.track/,
					/localDevices.map..*/,
					/webRtcTransports.stats.[0-9]+.report/
				],
			},
		}),
})
