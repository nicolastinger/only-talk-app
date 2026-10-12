/**
 * SDP / ICE 候选相关工具函数（纯函数，无状态）
 */

/** 从 SDP 文本中解析出 ICE 候选行 */
export const parseICECandidates = (
  sdp: string,
): Array<{ line: string; type: string; address: string; port: string }> => {
  const lines = sdp
    .split('\n')
    .filter((line) => line.startsWith('a=candidate:'));
  return lines.map((line) => {
    const parts = line.split(' ');
    if (parts.length >= 8) {
      return {
        line,
        type: parts[6],
        address: parts[4],
        port: parts[5],
      };
    }
    return { line, type: 'unknown', address: '', port: '' };
  });
};

/** 统计 SDP 中各类候选数量 */
export const countCandidatesByType = (
  sdp: string,
): { total: number; host: number; srflx: number } => {
  const candidates = parseICECandidates(sdp);
  return {
    total: candidates.length,
    host: candidates.filter((c) => c.type === 'host').length,
    srflx: candidates.filter((c) => c.type === 'srflx').length,
  };
};

/**
 * 优化SDP以提高NAT穿透成功率
 *
 * 保守策略：不做任何SDP修改，让浏览器自动处理
 * 现代浏览器已经自动优化了ICE和NAT穿透
 *
 * @param sdp 原始SDP字符串
 * @returns 优化后的SDP字符串
 */
export const optimizeSDPForNAT = (sdp: string): string => {
  // 保守策略：直接返回原始SDP，不做任何修改
  // 浏览器已经自动处理了大部分NAT穿透优化
  // 修改SDP可能会导致格式错误
  console.log(`[WebRTCService.optimizeSDPForNAT] 使用原始SDP（保守模式）`);
  return sdp;
};

/**
 * 等待ICE候选收集完成
 * 对NAT3环境很重要，确保收集到所有可能的候选
 *
 * @param connection RTCPeerConnection对象
 * @param timeout 超时时间（毫秒），默认5秒
 * @returns Promise，当候选收集完成或超时时resolve
 */
export const waitForIceGathering = (
  connection: RTCPeerConnection,
  timeout: number = 5000,
): Promise<void> => {
  return new Promise((resolve) => {
    // 如果已经完成，直接返回
    if (connection.iceGatheringState === 'complete') {
      console.log('[WebRTCService.waitForIceGathering] ✅ ICE候选已收集完成');
      resolve();
      return;
    }

    console.log(
      `[WebRTCService.waitForIceGathering] ⏳ 等待ICE候选收集，当前状态: ${connection.iceGatheringState}`,
    );

    // 设置超时
    const timer = setTimeout(() => {
      console.log('[WebRTCService.waitForIceGathering] ⏰ 等待超时，继续执行');
      // 清理监听器，避免内存泄漏
      connection.removeEventListener(
        'icegatheringstatechange',
        onGatheringStateChange,
      );
      resolve();
    }, timeout);

    // 使用addEventListener而非直接赋值，避免覆盖已有的处理器
    const onGatheringStateChange = () => {
      if (connection.iceGatheringState === 'complete') {
        console.log('[WebRTCService.waitForIceGathering] ✅ ICE候选收集完成');
        clearTimeout(timer);
        connection.removeEventListener(
          'icegatheringstatechange',
          onGatheringStateChange,
        );
        resolve();
      }
    };

    connection.addEventListener(
      'icegatheringstatechange',
      onGatheringStateChange,
    );
  });
};
