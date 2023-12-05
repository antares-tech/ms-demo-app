import CircularProgress from '@mui/material/CircularProgress';
import Box              from '@mui/material/Box';
import Typography       from '@mui/material/Typography';


function Loader (props) {
	const { message } = props;

	return (
		<Box sx={{ display: 'flex', alignItems : 'center' }}>
			<CircularProgress size='1rem' />
			<Typography variant='body1' sx={{ color : 'primary', marginLeft : '32px' }}>
				{ message || 'Loading ...'}
			</Typography>
		</Box>
	);
}

export default Loader;
