import Log from 'common/log';

const log = new Log ('rtcstats');

export default class RTCStats {

	static parse (report) {
		const stats = RTCStats._collect (report);

		const {
			selectedPair,
			localCandidate,
			remoteCandidate
		} = RTCStats._getSelectedPair (stats) || {};

		stats.selected = {
			pair   : selectedPair,
			local  : localCandidate,
			remote : remoteCandidate,
		};

		return stats;
	}

	static _collect (report) {
		const stats = {
			transport             : null,
			candidatePairs        : [],
			localCandidates       : [],
			remoteCandidates      : [],
			codecs                : [],
			outboundRtp           : [],
			remoteInboundRtp      : [],
		};

		for (const item of report.values ()) {

			switch (item.type) {

				case 'transport':
					stats.transport = item;
					break;

				case 'candidate-pair':
					stats.candidatePairs.push (item);
					break;

				case 'local-candidate':
					stats.localCandidates.push (item);
					break;

				case 'remote-candidate':
					stats.remoteCandidates.push (item);
					break;

				case 'codec':
					stats.codecs.push (item);
					break;

				case 'outbound-rtp':
					stats.outboundRtp.push (item);
					break;

				case 'remote-inbound-rtp':
					stats.remoteInboundRtp.push (item);
					break;

				default:
					break;
			}
		}

		return stats;
	}

	static _getSelectedPair (stats) {
		const { selectedCandidatePairId } = stats?.transport || {};

		if (!selectedCandidatePairId)
			return null;

		const selectedPair = stats.candidatePairs.find (c => c.id === selectedCandidatePairId);

		if (!selectedPair)
			return null;

		const { localCandidateId, remoteCandidateId } = selectedPair;
		const localCandidate  = stats.localCandidates.find  (c => c.id === localCandidateId);
		const remoteCandidate = stats.remoteCandidates.find (c => c.id === remoteCandidateId);

		return { selectedPair, localCandidate, remoteCandidate };
	}
}
