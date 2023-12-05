import React           from 'react';
import { useSelector } from 'react-redux';
import Log             from 'common/log';
import VideoWidget     from 'containers/video-widget'
import { Typography }  from 'antd';

const log = new Log ('local-widgers', 'debug');
const { Text } = Typography;

export default function LocalWidgets (props) {
	const me             = useSelector ((state) => state.me);
	const producers      = useSelector ((state) => state.producers.arr);
	const videoProducers = producers.filter (curr => curr.track.kind === 'video');

	return (
		<div className='producers'>
			<Text>
				Producers
			</Text>
			<div className='video-group-container'>
				{
				videoProducers.map (curr =>
						<VideoWidget
							key           = {`video-${curr.id}`}
							track         = {curr.track}
							displayName   = {me.displayName}
							userAgent     = {me.userAgent}
						/>
					)
				}
			</div>
		</div>
	);
}

