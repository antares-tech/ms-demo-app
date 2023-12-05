import React, {
	useState,
	useEffect,
	useRef,
}                      from 'react';
import { useSelector } from 'react-redux';
import Log             from 'common/log';
import { Typography }  from 'antd';

const log = new Log ('video-widget', 'debug');
const { Text } = Typography;

export default function VideoWidget ({ track, displayName, userAgent }) {
	const videoRef = useRef (null);
	const [ _track, set_Track ] = useState (null);

	useEffect (() => {
		if (track) {
			if (_track?.id !== track.id) {
				stopVideoTrack ();
				set_Track (track);
			}
		}

	}, [ track ]);

	useEffect(() => {
		if (_track)
			setVideoTrack (_track);
	}, [ _track ]);

	function stopVideoTrack () {
		const videoElement = videoRef.current;
		const stream       = videoElement.srcObject;

		if (stream) {
			stream.getTracks ().forEach ((t) => t.stop ());
			videoElement.srcObject = null;
		}
	}

	function setVideoTrack (tr) {
		const videoElement = videoRef.current;
		const stream       = new MediaStream ();

		stream.addTrack (tr);
		videoElement.srcObject = stream;

		videoElement.play ()
			.catch ((error) => log.error ('unable to play video', error));
	}

	return (
		<div className='video-container'>
			<video ref={videoRef}>
				Producers Placeholder
			</video>

			<div className='info-panel'>
				<Text className='user-agent'> {userAgent?.name || '--'} </Text>
				<Text className='display-name'> {displayName || '--'} </Text>
			</div>
		</div>
	);
}

