import React            from 'react';
import { useSelector }  from 'react-redux';
import Log              from 'common/log';
import { RTCStats }     from '@antares-tech/ms-client';
import { Typography }   from 'antd';
import { Space, Table } from 'antd';
import { Row, Col }     from 'antd';

const log = new Log ('transport-widget', 'debug');
const { Text, Title } = Typography;

export default function TransportWidget (props) {
	const transports = useSelector ((state) => state.webRtcTransports.arr);
	const stats      = useSelector ((state) => state.webRtcTransports.stats);

	function ConnectionClassName (state) {
		switch (state) {
			case 'connecting'    : return 'warning';
			case 'connected'     : return 'success';

			case 'disconnected'  :
			case 'failed'        :
			case 'closed'        :
				return 'danger';

			default              : return 'secondary';
		}
	}

	function IceStateClassName (state) {
		switch (state) {
			case 'gathering' : return 'warning';
			case 'complete'  : return 'success';
			default          : return 'secondary';
		}
	}

	function RenderStats ({ report }) {
		if (!report)
			return null;

		const parsedStats = RTCStats.parse (report);
		const {
			pair,
			local,
			remote
		} = parsedStats?.selected || {};

		return (
			<>
				<tr>
					<td colSpan='2' style={{ textAlign: 'center' }}> 
						<Text strong>Selected ICE candidate </Text>
					</td>
				</tr>
				<tr>
					<td colSpan='2' style={{ textAlign: 'center' }}> 
						<Text type='warning' strong>
							{ !local ?  '-' : `${local.protocol} - ${local.address}:${local.port} [${local.candidateType}]` }
						</Text>
						<Text> {' -> '} </Text>
						<Text type='success' strong>
							{ !remote ? '-' : `${remote.protocol} - ${remote.address}:${remote.port} [${remote.candidateType}]` }
						</Text>
					</td>
				</tr>

				{ /* Bytes */ }
				<tr>
					<td> <Text strong>Bytes Sent</Text> </td>
					<td> { !pair ? '-' : pair.bytesSent }</td>
				</tr>
				<tr>
					<td> <Text strong>Bytes Received</Text> </td>
					<td> { !pair ? '-' : pair.bytesReceived }</td>
				</tr>
				<tr>
					<td> <Text strong>Bytes Discarded</Text> </td>
					<td> <Text type='danger'>{ !pair ? '-' : pair.bytesDiscardedOnSend }</Text> </td>
				</tr>

				{ /* Packets */ }
				<tr>
					<td> <Text strong>Packets Sent</Text> </td>
					<td> { !pair ? '-' : pair.packetsSent }</td>
				</tr>
				<tr>
					<td> <Text strong>Packets Received</Text> </td>
					<td> { !pair ? '-' : pair.packetsReceived }</td>
				</tr>
				<tr>
					<td> <Text strong>Packets Discarded</Text> </td>
					<td> <Text type='danger'>{ !pair ? '-' : pair.packetsDiscardedOnSend }</Text> </td>
				</tr>

				{ /* Timestamps */ }
				<tr>
					<td> <Text strong>Last Packet RX TS</Text> </td>
					<td> { !pair ? '-' : (new Date (pair.lastPacketReceivedTimestamp)).toLocaleString () }</td>
				</tr>
			</>
		);
	}

	return (
		<div className='webrtc-transports'>
			<Title level={5}> WebRtc Transports </Title>
			<Row>
				{ transports.map (t => {
					const transportStats = stats.find (c => c.id === t.id);

					return (
						<Col span={12} key={`tbl-${t.id}`}>
							<table className='webrtc-transport-tbl'>

								<thead>
									<tr>
										<th colSpan={2}> <Title level={4}> {t.direction.toUpperCase ()}</Title> </th>
									</tr>
								</thead>

								<tbody>
									<tr>
										<td> <Text strong> Connection State </Text> </td>
										<td>
											<Text type={ConnectionClassName (t.connectionState)} >
												{t.connectionState}
											</Text>
										</td>
									</tr>

									<tr>
										<td> <Text strong> ICE Gathering State </Text> </td>
										<td>
											<Text type={IceStateClassName (t.iceGatheringState)}> {t.iceGatheringState} </Text>
										</td>
									</tr>
									<RenderStats id={t.id} report={transportStats?.report}/>
								</tbody>
							</table>
						</Col>
						);
					} 
				)}
			</Row>
		</div>
	);
}

