import { createSlice } from '@reduxjs/toolkit';
import Log             from 'common/log';

const log = new Log ('slices/webrtc-transport', 'info');

export const WebRtcTransports = createSlice ({
	name: 'webRtcTransport',

	initialState: {
		arr   : [],
		stats : [],
	},

	reducers: {
		addWebRtcTransport: (state, action) => {
			const newArr = [ ...state.arr, action.payload ];
			state.arr    = newArr;

			log.debug ('adding transport:', action.payload);
		},

		setConnectionState: (state, action) => {
			const { id, connectionState } = action.payload;
			const transport = state.arr.find (curr => curr.id === id);

			if (!transport) {
				log.error (`setConnectionState called for non-existent transport "${id}"`, action.payload);
				return;
			}

			transport.connectionState = connectionState;

			log.debug ('set connection state', action.payload);
		},

		setICEGatheringState: (state, action) => {
			const { id, iceGatheringState } = action.payload;
			const transport = state.arr.find (curr => curr.id === id);

			if (!transport) {
				log.error (`setICEGatheringState called for non-existent transport "${id}"`, action.payload);
				return;
			}

			transport.iceGatheringState = iceGatheringState;

			log.debug ('set ice gathering state', action.payload);
		},
		setStats: (state, action) => {
			const { id, report } = action.payload;
			let stats = state.stats.find (curr => curr.id === id);

			if (stats) {
				stats.report = report;
				log.debug ('updated stats', action.payload);
				return;
			}

			stats          = { id, report };
			const newStats = [ ...state.stats, stats ];
			state.stats = newStats;

			log.debug ('added stats', action.payload);
		},

		removeWebRtcTransport: (state, action) => {
			const { id } = action.payload;

			const newArr = state.arr.filter (c => c.id !== id);
			state.arr    = newArr;

			log.debug ('removing transport:', action.payload);
		},
	}
});

// Action creators are generated for each case reducer function
export const {
	addWebRtcTransport,
	setConnectionState,
	setICEGatheringState,
	setStats,
	removeWebRtcTransport,
} = WebRtcTransports.actions

export default WebRtcTransports.reducer
