import { createSlice }            from '@reduxjs/toolkit'
import Log                        from 'common/log';

const log = new Log ('slices/me');

export const Me = createSlice ({
	name: 'me',

	initialState: {
		id                   : null,
		VCID                 : null,
		displayName          : null,
		userAgent            : null,

		canSendMic           : true,
		canSendWebcam        : true,
		canChangeWebcam      : false,
		webcamInProgress     : false,
		shareInProgress      : false,
		audioOnly            : false,
		audioOnlyInProgress  : false,
		audioMuted           : false,
		restartIceInProgress : false
	},

	reducers: {
		setIdentity : (state, action) => {
			state.id          = action.payload.id;
			state.displayName = action.payload.displayName;
			state.VCID        = action.payload.VCID;
		},

		setMediaCapabilities: (state, action) => {
			state.canSendMic    = action.payload.canSendMic;
			state.canSendWebcam = action.payload.canSendWebcam;
		},

		setUserAgent        : (state, action) => { state.userAgent = action.payload; },
		setWebcamInProgress : (state, action) => { state.webcamInProgress = action.payload; },
		setCanChangeWebcam  : (state, action) => { state.canChangeWebcam = action.payload; },
	}
});

// Action creators are generated for each case reducer function
export const {
	setIdentity,
	setMediaCapabilities,
	setUserAgent,
	setWebcamInProgress,
	setCanChangeWebcam,
} = Me.actions

export default Me.reducer
