import React           from 'react';
import { useSelector } from 'react-redux';
import Log             from 'common/log';
import VideoWidget     from 'containers/video-widget'
import { Typography }  from 'antd';

const log = new Log ('local-widgers', 'debug');
const { Text } = Typography;

export default function RemoteWidgets (props) {
	const peers          = useSelector ((state) => state.peers.map);
	const consumers      = useSelector ((state) => state.consumers.arr);
	const videoConsumers = consumers.filter (curr => curr.track.kind === 'video');
	const audioConsumers = consumers.filter (curr => curr.track.kind === 'audio');

	log.debug ('consumers = ', videoConsumers)

	return (
		<div className='consumers'>
			<Text>
				Consumers
			</Text>
			<div className='video-group-container'>
				{ videoConsumers.map (curr => {
						const peer = peers[curr.peerVCID];
						let audio = audioConsumers.find(audio => audio.appData?.streamId === curr.appData?.streamId);
						return (
							<VideoWidget
								key           = {`video-${curr.id}`}
								videoTrack    = {curr.track}
								audioTrack    = {audio.track}
								displayName   = {peer?.displayName || '--'}
								userAgent     = {peer?.userAgent}
							/>
						);
					})
				}
			</div>
		</div>
	);
}

