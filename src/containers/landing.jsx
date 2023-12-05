/* eslint no-unused-vars: "off" */

import React, { useEffect }    from 'react';
import { useState }            from 'react';
import { useHistory }          from 'react-router-dom';
import { useLocation }         from 'react-router-dom';
import { Button, Form, Input } from 'antd';
import { Row, Col }            from 'antd';
import Log                     from 'common/log';

const log = new Log ('landing', 'debug');

export default function Landing (props) {
	const history         = useHistory ();
	const { search }      = useLocation ();
	const urlSearchParams = new URLSearchParams (search);
	const msLandingHost   = urlSearchParams.get ('ms');
	const room            = urlSearchParams.get ('room');
	const [form]          = Form.useForm ();

	const [ roomId, setRoomId ] = useState (room);
	const [ msHost, setMsHost ] = useState (msLandingHost);

	function join (ev) {
		const { roomId, serverHost } = ev;
		const serverHostURI = encodeURIComponent (serverHost);
		history.push (`/room/${roomId}?ms=${serverHostURI}`)
	}

	useEffect (() => {
		form.setFieldsValue ({
			roomId,
			serverHost: msHost,
		});
	});

	return (
		<div style={{
		    backgroundColor: '#f0f0f0',
			width: '50%',
			position: 'absolute',
			top: '50%',
			transform: 'translate(-50%, -50%)',
			left:'50%',
			padding: '32px',
			maxWidth: '800px',
		}}>
			<Row>
				<Col span={12} offset={6}>
					<Form
						name='form-roomid'
						onFinish={join}
						form={form}
					>
						<Form.Item
						  label="Room Id"
						  name="roomId"
						  rules={[{ required: true, message: 'Enter Room Id' }]}
						>
							<Input />
						</Form.Item>

						<Form.Item
						  label="Media Server Host + Port"
						  name="serverHost"
						  rules={[{ required: true, message: 'Enter hostname:port' }]}
						>
							<Input />
						</Form.Item>

						<Button type="primary" htmlType="submit">
							Join
						</Button>
					</Form>
				</Col>
			</Row>
		</div>
	);
}
