import { createSlice } from '@reduxjs/toolkit';
import Log             from 'common/log';

const log = new Log ('slices/producers');

export const Producers = createSlice ({
	name: 'producers',

	initialState: {
		arr : []
	},

	reducers: {
		addProducer: (state, action) => {
			const newArr = [ ...state.arr, action.payload ];
			state.arr    = newArr;

			log.debug ('adding producer:', action.payload);
		},
		removeProducer: (state, action) => {
			const { id } = action.payload;

			const newArr = state.arr.filter (c => c.id !== id);
			state.arr    = newArr;

			log.debug ('removing producer:', action.payload);
		},
	}
});

// Action creators are generated for each case reducer function
export const {
	addProducer,
	removeProducer,
} = Producers.actions

export default Producers.reducer
