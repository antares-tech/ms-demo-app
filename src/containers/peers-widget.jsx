import React            from 'react';
import { useSelector }  from 'react-redux';
import Log              from 'common/log';
import { Typography }   from 'antd';
import { Space, Table } from 'antd';

const log = new Log ('peers-widget', 'debug');
const { Text, Title } = Typography;

export default function PeersWidget (props) {
	const peers = useSelector ((state) => state.peers.map);
	const peersArray = Object.values (peers);

	log.debug ('peers = ', peersArray);

	const columns = [
		{
			title     : 'id',
			dataIndex : 'id',
			key       : 'id',
			render    : (text) => <Text type='warning'> <b> { text } </b> </Text>,
		},
		{
			title     : 'Name',
			dataIndex : 'displayName',
			key       : 'displayName',
			render    : (text) => <Text type='success'> <b> { text } </b> </Text>,
		},
		{
			title     : 'VCID',
			dataIndex : 'VCID',
			key       : 'VCID',
		},
	];

	return (
		<div className='peers'>
			<Title level={5}>
				Peers
			</Title>

			<Table
				columns={columns}
				dataSource={peersArray}
				rowKey={(record) => record.VCID}
			/>
		</div>
	);
}

