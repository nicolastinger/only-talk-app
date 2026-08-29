/**
 * WebRTC 连接诊断与统计工具（纯函数，仅接收连接对象或数据）
 */
import { countCandidatesByType, parseICECandidates } from './SdpHelper';

/**
 * 打印ICE候选对统计信息（用于调试）
 * @param friendId 对端用户ID
 * @param connection RTCPeerConnection对象
 */
export const logCandidatePairStats = async (
  friendId: string,
  connection: RTCPeerConnection,
): Promise<void> => {
  try {
    const stats = await connection.getStats();
    let activeCandidatePair: any = null;
    let totalCandidatePairs = 0;
    let succeededPairs = 0;
    let failedPairs = 0;

    // 收集本地和远程候选的详细信息，用于显示成功连接的地址
    const localCandidates = new Map<
      string,
      { ip: string; port: number; protocol: string; type: string }
    >();
    const remoteCandidates = new Map<
      string,
      { ip: string; port: number; protocol: string; type: string }
    >();

    stats.forEach((report) => {
      if (report.type === 'candidate-pair') {
        totalCandidatePairs++;
        if (report.state === 'succeeded') {
          succeededPairs++;
          activeCandidatePair = report;
        } else if (report.state === 'failed') {
          failedPairs++;
        }
      } else if (report.type === 'local-candidate') {
        localCandidates.set(report.id, {
          ip: report.ip || report.get?.('ip') || '未知',
          port: report.port || report.get?.('port') || 0,
          protocol: report.protocol || report.get?.('protocol') || '未知',
          type: report.candidateType || report.get?.('candidateType') || '未知',
        });
      } else if (report.type === 'remote-candidate') {
        remoteCandidates.set(report.id, {
          ip: report.ip || report.get?.('ip') || '未知',
          port: report.port || report.get?.('port') || 0,
          protocol: report.protocol || report.get?.('protocol') || '未知',
          type: report.candidateType || report.get?.('candidateType') || '未知',
        });
      }
    });

    if (totalCandidatePairs > 0) {
      console.log(
        `[WebRTCService.logCandidatePairStats] 📊 ICE候选对统计 [${friendId}]:`,
      );
      console.log(`  - 总候选对数: ${totalCandidatePairs}`);
      console.log(`  - 成功连接数: ${succeededPairs}`);
      console.log(`  - 失败连接数: ${failedPairs}`);

      if (activeCandidatePair) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pair = activeCandidatePair as any;
        const localCandId =
          pair.localCandidateId || pair.get?.('localCandidateId');
        const remoteCandId =
          pair.remoteCandidateId || pair.get?.('remoteCandidateId');

        // 获取具体的候选地址信息
        const localCand = localCandidates.get(localCandId);
        const remoteCand = remoteCandidates.get(remoteCandId);

        console.log(`  - ✅ 活跃候选对详情:`);
        console.log(
          `    • 本地候选: ${
            localCand
              ? `${localCand.ip}:${localCand.port} (${localCand.protocol}, ${localCand.type})`
              : `ID: ${localCandId}`
          }`,
        );
        console.log(
          `    • 远程候选: ${
            remoteCand
              ? `${remoteCand.ip}:${remoteCand.port} (${remoteCand.protocol}, ${remoteCand.type})`
              : `ID: ${remoteCandId}`
          }`,
        );

        const rtt =
          pair.currentRoundTripTime ?? pair.get?.('currentRoundTripTime');
        console.log(`    • 往返延迟(RTT): ${rtt?.toFixed?.(3) || '未知'}s`);
        console.log(
          `    • 接收字节: ${
            (pair.bytesReceived ?? pair.get?.('bytesReceived')) || 0
          }`,
        );
        console.log(
          `    • 发送字节: ${(pair.bytesSent ?? pair.get?.('bytesSent')) || 0}`,
        );

        // 如果是通过srflx或relay成功连接，特别标注
        if (localCand?.type === 'srflx' || remoteCand?.type === 'srflx') {
          console.log(`    • 🎯 连接方式: NAT穿透成功 (srflx候选)`);
        } else if (
          localCand?.type === 'relay' ||
          remoteCand?.type === 'relay'
        ) {
          console.log(`    • 🎯 连接方式: TURN中继 (relay候选)`);
        } else if (localCand?.type === 'host' && remoteCand?.type === 'host') {
          console.log(`    • 🎯 连接方式: 直连/同局域网 (host候选)`);
        }
      } else if (succeededPairs === 0 && failedPairs > 0) {
        console.warn(
          `[WebRTCService.logCandidatePairStats] ⚠️ 所有候选对都失败了！`,
        );
      }
    }
  } catch (error) {
    // 忽略统计信息获取错误（不影响连接）
    console.debug(
      `[WebRTCService.logCandidatePairStats] 获取统计信息失败（可忽略）:`,
      error,
    );
  }
};

/**
 * 打印详细的ICE连接诊断信息
 * @param friendId 对端用户ID
 * @param connection RTCPeerConnection对象
 */
export const logIceDiagnostics = async (
  friendId: string,
  connection: RTCPeerConnection,
): Promise<void> => {
  console.log(
    `[WebRTCService.logIceDiagnostics] 🔍 ICE连接诊断信息 [${friendId}]:`,
  );
  console.log(`  - 连接状态: ${connection.connectionState}`);
  console.log(`  - ICE状态: ${connection.iceConnectionState}`);
  console.log(`  - 收集状态: ${connection.iceGatheringState}`);
  console.log(`  - 信令状态: ${connection.signalingState}`);

  // 打印本地描述中的候选
  if (connection.localDescription?.sdp) {
    const localCandidates = parseICECandidates(connection.localDescription.sdp);
    console.log(`  - 本地候选数: ${localCandidates.length}`);
    localCandidates.forEach((candidate, index) => {
      console.log(
        `    ${index + 1}. ${candidate.type} - ${candidate.address}:${
          candidate.port
        }`,
      );
    });
  }

  // 打印远程描述中的候选
  if (connection.remoteDescription?.sdp) {
    const remoteCandidates = parseICECandidates(
      connection.remoteDescription.sdp,
    );
    console.log(`  - 远程候选数: ${remoteCandidates.length}`);
    remoteCandidates.forEach((candidate, index) => {
      console.log(
        `    ${index + 1}. ${candidate.type} - ${candidate.address}:${
          candidate.port
        }`,
      );
    });
  }

  // 打印候选对统计
  await logCandidatePairStats(friendId, connection);
};

/**
 * 汇总所有连接的状态摘要
 * @param connections 连接映射
 * @param dataChannels 数据通道映射
 * @param iceRestartCount ICE重启次数映射
 * @param hasLocalStream 是否已初始化本地媒体流
 * @param remoteStreams 远程媒体流映射
 */
export const buildConnectionSummary = (
  connections: Map<string, RTCPeerConnection>,
  dataChannels: Map<string, RTCDataChannel>,
  iceRestartCount: Map<string, number>,
  hasLocalStream: boolean,
  remoteStreams: Map<string, MediaStream>,
): Record<string, any> => {
  const summary: Record<string, any> = {};

  connections.forEach((connection, friendId) => {
    summary[friendId] = {
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
      iceGatheringState: connection.iceGatheringState,
      signalingState: connection.signalingState,
      iceRestartCount: iceRestartCount.get(friendId) || 0,
      hasLocalStream,
      hasRemoteStream: remoteStreams.has(friendId),
      dataChannelOpen: dataChannels.get(friendId)?.readyState === 'open',
    };
  });

  return summary;
};

/** 便捷工具：根据 SDP 统计候选并打日志（沿用在 createOffer/handleOffer 中） */
export const logCandidateSummary = (sdp: string, prefix: string): void => {
  const { total, host, srflx } = countCandidatesByType(sdp);
  console.log(
    `[WebRTCService.${prefix}] 📊 候选类型分布: host=${host}, srflx=${srflx} (共${total}个)`,
  );
};
