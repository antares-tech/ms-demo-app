import { createSlice } from '@reduxjs/toolkit';
import Log             from 'common/log';

const log = new Log ('slices/peers');

export const Peers = createSlice ({
	name: 'peers',

	initialState: {
		map : {},
	},

	reducers: {
		addPeer: (state, action) => {
			const { VCID } = action.payload;

			state.map[VCID] = { ...action.payload };
			log.debug ('adding peer:', action.payload);
		},
		removePeer: (state, action) => {
			const { VCID } = action.payload;

			delete state.map[VCID];
			log.debug ('removing peer:', action.payload);
		},
	}
});

// Action creators are generated for each case reducer function
export const {
	addPeer,
	removePeer,
} = Peers.actions

export default Peers.reducer
