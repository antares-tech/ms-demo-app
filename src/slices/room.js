import { createSlice }            from '@reduxjs/toolkit'
import Log                        from 'common/log';

const log = new Log ('slices/room')

export const Room = createSlice ({
	name: 'room',

	initialState: {
		state                  : null,
		mediasoupClientHandler : null,
	},

	reducers: {
		setRoomState                  : (state, action) => { state.state = action.payload; },
		setRoomMediasoupClientHandler : (state, action) => { state.mediasoupClientHandler = action.payload; },
	}
});

// Action creators are generated for each case reducer function
export const {
	setRoomState,
	setRoomMediasoupClientHandler,
} = Room.actions

export default Room.reducer
