import { createSlice }            from '@reduxjs/toolkit'
import Log                        from 'common/log';

const log = new Log ('slices/notif');

export const Notifications = createSlice ({
	name: 'notifications',

	initialState: {
		list : [],
	},

	reducers: {
		notify: (state, action) => {
			state.list = [ ...state.list, action.payload ]
		},
		removeAllNotifications: (state, action) => { state.list = [] },
	}
});

// Action creators are generated for each case reducer function
export const {
	notify,
	removeAllNotifications,
} = Notifications.actions

export default Notifications.reducer
