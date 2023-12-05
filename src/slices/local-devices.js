import { createSlice }            from '@reduxjs/toolkit'
import Log                        from 'common/log';

const log = new Log ('local-devices');

export const LocalDevices = createSlice ({
	name: 'localDevices',

	initialState: {
		map     : {},
		counter : 0,
	},

	reducers: {
		addTrack: (state, action) => {
			const { track, streamId } = action.payload;
			const id = track.id;

			state.map[id] = action.payload;
			state.counter = state.counter + 1;
			log.debug ('addTrack', action.payload);
		},
	}
});

// Action creators are generated for each case reducer function
export const {
	addTrack,
} = LocalDevices.actions

export default LocalDevices.reducer
