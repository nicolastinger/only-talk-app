/**
 * WebRTC 默认配置（与 PC 端 webrtcService/config.ts 保持一致，保证跨端互通）
 *
 * - 仅 STUN（纯 P2P），未配置 TURN：双方均处对称 NAT 时无法建立连接（同 PC 现状）
 * - iceTransportPolicy 'all' + max-bundle + require rtcp-mux + 候选池 10
 */
export const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.miwifi.com:3478" },
    { urls: "stun:stun.chat.bilibili.com:3478" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.skype.com:3478" },
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 10,
};

export const createWebRTCConfig = (): RTCConfiguration => ({
  ...DEFAULT_WEBRTC_CONFIG,
});

/** 是否配置了 TURN（无 TURN 时跳过 relay 候选） */
export const hasTurnServer = (
  config: RTCConfiguration = DEFAULT_WEBRTC_CONFIG
): boolean =>
  config.iceServers?.some((server) =>
    typeof server.urls === "string"
      ? server.urls.startsWith("turn:") || server.urls.startsWith("turns:")
      : Array.isArray(server.urls) &&
        server.urls.some(
          (u) => u.startsWith("turn:") || u.startsWith("turns:")
        )
  ) ?? false;
