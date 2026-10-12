/**
 * WebRTC 服务对外入口（单例 + barrel）
 *
 * 对外 API（initWebRTCService / getWebRTCService / WebRTCService）保持不变，
 * 内部实现已拆分为 config / SdpHelper / Diagnostics / NatDetector / IceConnector 专注模块。
 */
export {
  createWebRTCConfig,
  DEFAULT_WEBRTC_CONFIG,
  hasTurnServer,
} from './config';
export {
  buildConnectionSummary,
  logCandidatePairStats,
  logIceDiagnostics,
} from './Diagnostics';
export { DEFAULT_ICE_RUNTIME_CONFIG, IceConnector } from './IceConnector';
export type { IceConnectorContext, IceRuntimeConfig } from './IceConnector';
export { adjustConfigForNATType, NatDetector } from './NatDetector';
export type { NATType } from './NatDetector';
export {
  countCandidatesByType,
  optimizeSDPForNAT,
  parseICECandidates,
  waitForIceGathering,
} from './SdpHelper';
export { WebRTCService } from './WebRTCService';
import { WebRTCService } from './WebRTCService';

/** 全局WebRTC服务实例，单例模式 */
let webRTCServiceInstance: WebRTCService | null = null;

/**
 * 初始化或获取WebRTC服务实例
 * 使用单例模式确保整个应用只有一个WebRTCService实例
 *
 * @param localUserId 当前用户ID，仅在第一次初始化时使用
 * @returns WebRTCService单例实例
 */
export const initWebRTCService = (localUserId: string): WebRTCService => {
  if (!webRTCServiceInstance) {
    webRTCServiceInstance = new WebRTCService(localUserId);
  }
  return webRTCServiceInstance;
};

/**
 * 获取已初始化的WebRTC服务实例
 * @returns WebRTCService实例，如果未初始化则返回null
 */
export const getWebRTCService = (): WebRTCService | null => {
  return webRTCServiceInstance;
};
