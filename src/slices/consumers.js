import { createSlice } from '@reduxjs/toolkit';
import Log             from 'common/log';

const log = new Log ('slices/consumers');

export const Consumers = createSlice ({
	name: 'consumers',

	initialState: {
		arr : []
	},

	reducers: {
		addConsumer: (state, action) => {
			const newArr = [ ...state.arr, action.payload ];
			state.arr    = newArr;

			log.debug ('adding consumer:', action.payload);
			log.debug ('current state:', state.arr);
		},
		removeConsumer: (state, action) => {
			const { consumer } = action.payload;
			const { id }       = consumer;

			const newArr = state.arr.filter (c => c.id !== id);
			state.arr    = newArr;

			log.debug ('removing consumer:', action.payload);
			log.debug ('current state:', state.arr);
		},
	}
});

// Action creators are generated for each case reducer function
export const {
	addConsumer,
	removeConsumer,
} = Consumers.actions

export default Consumers.reducer
