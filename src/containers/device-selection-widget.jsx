/* eslint no-unused-vars : "off" */
import { v4 as uuidv4 } from 'uuid';
import React, {
	useEffect,
	useState,
}                       from 'react';
import { useParams }    from 'react-router-dom';
import { useHistory }   from 'react-router-dom';
import { useLocation }  from 'react-router-dom';
import { useSelector }  from 'react-redux';
import randomString     from 'random-string';
import Log              from 'common/log';
import store            from 'store';
import { addTrack }     from 'slices/local-devices';
import VideoWidget      from 'containers/video-widget';
import { Typography }   from 'antd';
import { Row }          from 'antd';
import { Col }          from 'antd';
import { Button }       from 'antd';
import { Select }       from 'antd';
import { Space }        from 'antd';

const log = new Log ('device-sel-widget');
const { Text } = Typography;

export default function SelectDevice ({ promiseHandlers }) {
	const history    = useHistory ();
	const { search } = useLocation ();
	const { roomId } = useParams ();

	const [ init, setInit ]                                 = useState (false);
	const [ streamId, setStreamId ]                         = useState (null);
	const [ defaultAudioDeviceId, setDefaultAudioDeviceId ] = useState (null);
	const [ defaultVideoDeviceId, setDefaultVideoDeviceId ] = useState (null);
	const [ auDevices, setAuDevices ]                       = useState (null);
	const [ viDevices, setViDevices ]                       = useState (null);
	const [ selectedAuDevice, setSelectedAuDevice ]         = useState (null);
	const [ selectedViDevice, setSelectedViDevice ]         = useState (null);
	const [ selectedAuTrack, setSelectedAuTrack ]           = useState (null);
	const [ selectedViTrack, setSelectedViTrack ]           = useState (null);

	async function hackGetUserMedia () {
		const stream = await navigator.mediaDevices.getUserMedia ({
			audio: true,
			video: true,
		});
		const _audio = stream.getAudioTracks ()[0];
		const _video = stream.getVideoTracks ()[0];

		const audioDeviceId = _audio.getSettings ().deviceId;
		const videoDeviceId = _video.getSettings ().deviceId;

		_audio.stop ();
		_video.stop ();

		return { audioDeviceId, videoDeviceId };
	}

	async function getDevices () {
		const { audioDeviceId, videoDeviceId } = await hackGetUserMedia ();

		const deviceList = await navigator.mediaDevices.enumerateDevices ();

		setDefaultAudioDeviceId (audioDeviceId);
		setDefaultVideoDeviceId (videoDeviceId);
		setAuDevices (deviceList.filter (d => d.kind === 'audioinput'));
		setViDevices (deviceList.filter (d => d.kind === 'videoinput'));
	}

	async function openAudioDevice (dev) {
		const stream = await navigator.mediaDevices.getUserMedia ({
			'audio' : { deviceId: dev.deviceId },
		});

		const track = stream.getAudioTracks ()[0];

		setSelectedAuDevice (dev);
		setSelectedAuTrack (track);
	}

	async function openVideoDevice (dev) {
		const stream = await navigator.mediaDevices.getUserMedia ({
			'video' : {
				deviceId: dev.deviceId,
				width:    { min: 1024, ideal: 1920, max: 1920 },
				height:   { min: 576, ideal: 1080, max: 1080 },
			},
		});

		const track = stream.getVideoTracks ()[0];

		setSelectedViDevice (dev);
		setSelectedViTrack (track);
	}

	async function onAudioChange (deviceId) {
		const newDevice = auDevices.find (d => d.deviceId === deviceId)

		if (selectedAuDevice.deviceId === deviceId)
			return;

		selectedAuTrack?.stop ();
		await openAudioDevice (newDevice);
	}

	async function onVideoChange (deviceId) {
		const newDevice = viDevices.find (d => d.deviceId === deviceId)

		if (selectedViDevice.deviceId === deviceId)
			return;

		selectedViTrack?.stop ();
		await openVideoDevice (newDevice);
	}

	function onClick () {
		promiseHandlers.resolve ({
			audioTrack : selectedAuTrack,
			videoTrack : selectedViTrack,
			streamId   : uuidv4 (),
		});
	}

	useEffect (() => {
		if (init)
			return;

		setInit (true);
	}, []);

	useEffect (() => {
		if (init)
			(async () => { await getDevices (); }) ();
	}, [ init ]);

	useEffect (() => {
		if (auDevices && defaultAudioDeviceId)
			(async () => {
				const dev = auDevices.find (d => d.deviceId === defaultAudioDeviceId);
				await openAudioDevice (dev);
			}) ();
	}, [ auDevices, defaultAudioDeviceId ]);

	useEffect (() => {
		if (viDevices && defaultVideoDeviceId)
			(async () => {
				const dev = viDevices.find (d => d.deviceId === defaultVideoDeviceId);
				await openVideoDevice (dev);
			}) ();
	}, [ viDevices, defaultVideoDeviceId ]);


	const auOpts = auDevices && auDevices.map (d => { return { value: d.deviceId, label: d.label }; });
	const viOpts = viDevices && viDevices.map (d => { return { value: d.deviceId, label: d.label }; });

	return (
		<div className="select-device">
			<Row>
				<Col span={12}>
					<Select
						value={selectedAuDevice?.deviceId}
						onChange={onAudioChange}
						options={auOpts}
						disabled={!selectedAuDevice || !selectedAuDevice.deviceId}
						style={{ width: '100%' }}
					/>
				</Col>
				<Col span={12}>
					<Select
						value={selectedViDevice?.deviceId}
						onChange={onVideoChange}
						options={viOpts}
						disabled={!selectedViDevice || !selectedViDevice.deviceId}
						style={{ width: '100%' }}
					/>
				</Col>
			</Row>

			<Row>
				<Col span={24} style={{ height : '200px' }}>
					<VideoWidget
						track={selectedViTrack}
						displayName={selectedViDevice?.label}
					/>
				</Col>
			</Row>

			<Row justify='center' style={{ marginTop : '32px' }}>
				<Col span={4}>
					<Button type='primary' onClick={onClick}> OK </Button>
				</Col>
			</Row>
		</div>
	);
}
