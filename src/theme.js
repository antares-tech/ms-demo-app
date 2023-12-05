import { createTheme } from '@mui/material/styles';
import scssExports     from 'scss/exports.module.scss';
import Log             from 'common/log';

const log = new Log ('theme', 'debug');

const theme = createTheme ({
	palette: {
		primary: {
			main: scssExports.primary,
		},
		secondary: {
			main: scssExports.secondary,
		},
		success: {
			main: scssExports.success,
		},
		error: {
			main: scssExports.danger,
		},
		warning: {
			main: scssExports.warning,
		},
		info: {
			main: scssExports.info,
		},
		debug: {
			main: scssExports['gray-500'],
			contrastText : '#fff',
		},
	},
	typography: {
		fontFamily: scssExports['font-family-sans-serif'],
	},
	shape: {
		borderRadius: 8,
	}
});

export default theme
