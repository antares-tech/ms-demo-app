/* eslint no-unused-vars : "off" */
import React, { useState, useEffect } from 'react';
import { Alert }                      from 'antd';
import Log                            from 'common/log';

const log = new Log ('alerts', 'debug');

export default function Alerts ({ msg }) {
	const [ show, setShow ] = useState (true);
	const { timeout } = msg;

	useEffect (() => {
		if (timeout) {
			setTimeout (() => {
				setShow (false);
			}, timeout);
		}
	}, []);

	if (!show)
		return null;

	return (
		<Alert
			rootClassName='alert-root'
			closable
			showIcon={true}
			closeIcon={true}
			message={msg.message}
			description={msg.description}
			type={msg.type}
		/>
	);
}
