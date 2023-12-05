/* eslint no-unused-vars : "off" */
import React, {
	useEffect,
	useState,
}                                   from 'react';
import { useParams }                from 'react-router-dom';
import { useHistory }               from 'react-router-dom';
import { useLocation }              from 'react-router-dom';
import { useSelector }              from 'react-redux';
import randomString                 from 'random-string';
import Log                          from 'common/log';
import store                        from 'store';
import { addTrack }                 from 'slices/local-devices';
import DeviceSelectionWidget        from 'containers/device-selection-widget';
import { Typography }               from 'antd';
import { Row }                      from 'antd';
import { Col }                      from 'antd';
import { Select }                   from 'antd';

const log = new Log ('select-device', 'debug');
const { Text } = Typography;

export default function SelectDevice (props) {
	const history    = useHistory ();
	const { search } = useLocation ();
	const { roomId } = useParams ();

	const [ init, setInit ]                      = useState (false);
	const [ promiseHandlers, setPromiseHandler ] = useState (null);
	const [ selected, setSelected ]              = useState (false);

	const urlSearchParams = new URLSearchParams (search);
	const _chooseDevices  = urlSearchParams.get ('chooseDevices') || 'no';
	const chooseDevices   = _chooseDevices === 'yes';

	async function getDefaultDevice () {
		try {
			const stream = await navigator.mediaDevices.getUserMedia (
				{
					audio: true,
					video: {
						width: { min: 1024, ideal: 1920, max: 1920 },
						height: { min: 576, ideal: 1080, max: 1080 },
					}
				}
			);
			const _audio = stream.getAudioTracks ()[0];
			const _video = stream.getVideoTracks ()[0];

			if (_audio) store.dispatch (addTrack ({ track: _audio, streamId: stream.id }));
			if (_video) store.dispatch (addTrack ({ track: _video, streamId: stream.id }));

			log.debug ('audio = ', _audio?.label)
			log.debug ('video = ', _video?.label)
		}
		catch (err) {
			log.error ('getUserMedia failed:', err);
			throw err;
		}
	}

	function getDevices () {
		if (!chooseDevices)
			return getDefaultDevice ();

		return chooseDevice ();
	}

	async function chooseDevice () {
		const promise = new Promise ((resolve, reject) => {
			setPromiseHandler ({ resolve, reject });
		});

		const data = await promise;
		const { audioTrack, videoTrack, streamId } = data;

		store.dispatch (addTrack ({ track: audioTrack, streamId }));
		store.dispatch (addTrack ({ track: videoTrack, streamId }));

		log.debug ('audio = ', audioTrack.label)
		log.debug ('video = ', videoTrack.label)

		return true;
	}

	useEffect (() => {
		if (init)
			return;

		setInit (true);
	}, []);

	useEffect (() => {
		if (!init)
			return;

		(async () => {
			if (selected)
				return;

			await getDevices ();
			setSelected (true);
		}) ();
	}, [ init ]);

	useEffect (() => {
		if (selected)
			history.push (`/room/${roomId}${search}`);
	}, [ selected ]);

	return (
		<div>
			{ !chooseDevices &&
				<Text> Please provide permissions to devices </Text>
			}

			{ promiseHandlers !== null &&
				<DeviceSelectionWidget
					promiseHandlers={promiseHandlers}
				/>
			}
		</div>
	);
}
