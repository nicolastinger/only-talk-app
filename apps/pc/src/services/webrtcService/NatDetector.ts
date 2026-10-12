/**
 * NAT 类型检测器（自包含，使用临时 RTCPeerConnection）
 *
 * 检测到对称/受困 NAT 时，会原地调整注入的运行时 ICE 配置（IceRuntimeConfig），
 * 从而影响 IceConnector 的超时/重启策略。
 */
import { createWebRTCConfig } from './config';
import { IceRuntimeConfig } from './IceConnector';

/** NAT 类型 */
export type NATType = 'blocked' | 'symmetric' | 'cone' | 'public' | 'unknown';

/**
 * 根据检测到的NAT类型调整配置参数（原地修改传入的运行时配置对象）
 * @param natType NAT类型
 * @param config 运行时配置
 */
export const adjustConfigForNATType = (
  natType: string,
  config: IceRuntimeConfig,
): void => {
  switch (natType) {
    case 'symmetric':
      console.log(
        `[WebRTCService.adjustConfigForNATType] 🔄 检测到对称NAT(Symmetric NAT)，调整配置...`,
      );
      console.warn(
        `[WebRTCService.adjustConfigForNATType] ⚠️ 对称NAT穿透难度极高，双方都在对称NAT后时需要TURN中继`,
      );
      // 对称NAT环境下增加超时时间和重启次数
      config.iceConnectionTimeout = 60000; // 增加到60秒
      config.iceRestartInterval = 8000; // 缩短到8秒，更频繁尝试
      config.maxIceRestartCount = 5; // 增加到5次
      break;

    case 'cone':
    case 'public':
      console.log(
        `[WebRTCService.adjustConfigForNATType] ✅ 网络条件良好(${natType})，使用标准配置`,
      );
      // 保持默认配置
      break;

    case 'blocked':
      console.warn(
        `[WebRTCService.adjustConfigForNATType] ⚠️ 网络受限严重，尝试更激进的策略`,
      );
      // 尝试更长的超时和更多重启次数
      config.iceConnectionTimeout = 90000; // 90秒
      config.iceRestartInterval = 5000; // 5秒
      config.maxIceRestartCount = 7; // 允许更多重启
      break;

    default:
      console.log(`[WebRTCService.adjustConfigForNATType] 使用默认配置`);
      break;
  }

  console.log(`[WebRTCService.adjustConfigForNATType] 配置已调整:`);
  console.log(`  - 超时时间: ${config.iceConnectionTimeout / 1000}秒`);
  console.log(`  - 重启间隔: ${config.iceRestartInterval / 1000}秒`);
  console.log(`  - 最大重启次数: ${config.maxIceRestartCount}次`);
};

export class NatDetector {
  /** 检测到的NAT类型 */
  private detectedNATType: string | null = null;
  /** 是否已完成NAT检测 */
  private isNATDetected: boolean = false;
  /** 运行时ICE配置（与 IceConnector 共享的引用） */
  private runtimeConfig: IceRuntimeConfig;

  constructor(runtimeConfig: IceRuntimeConfig) {
    this.runtimeConfig = runtimeConfig;
  }

  /** 获取检测到的NAT类型 */
  getDetectedNATType(): string | null {
    return this.detectedNATType;
  }

  /** 是否已完成NAT检测 */
  isNATDetectionComplete(): boolean {
    return this.isNATDetected;
  }

  /**
   * 检测当前网络的NAT类型
   *
   * 正确的对称NAT检测方法：
   * 向多个不同的STUN服务器发送请求，比对返回的映射地址。
   * 如果不同STUN服务器返回不同的映射端口，说明是对称NAT。
   * 如果所有STUN服务器返回相同的映射地址，说明是锥形NAT。
   *
   * 这里的简化检测基于收集srflx候选时的观察：
   * - 如果有多个srflx候选且映射端口不同 → 对称NAT
   * - 如果只有唯一一个srflx映射地址 → 锥形NAT
   * - 如果没有srflx候选 → UDP被阻止或STUN服务器不可达
   */
  async detectNATType(): Promise<void> {
    console.log(`[WebRTCService.detectNATType] 开始检测NAT类型...`);

    try {
      const config = createWebRTCConfig();
      const tempConnection = new RTCPeerConnection(config);

      let hasHostCandidate = false;
      let candidateCount = 0;
      // 收集所有srflx候选的映射地址和端口，用于检测对称NAT
      const srflxMappings: { ip: string; port: number }[] = [];

      // 创建数据通道：配置为 max-bundle 时，无媒体/数据通道的 offer 没有 BUNDLE 组，
      // 会导致 setLocalDescription 失败。添加数据通道可产生 BUNDLE 组并收集候选。
      tempConnection.createDataChannel('nat-detect');

      // 收集ICE候选以分析NAT类型
      tempConnection.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          const type = event.candidate.type;
          console.log(
            `[WebRTCService.detectNATType] 收到候选 - 类型: ${type}, 地址: ${event.candidate.address}, 端口: ${event.candidate.port}`,
          );

          if (type === 'host') {
            hasHostCandidate = true;
          } else if (type === 'srflx') {
            // 记录srflx映射地址
            srflxMappings.push({
              ip: event.candidate.address || '',
              port: event.candidate.port || 0,
            });
          }
        }
      };

      // 创建offer触发ICE候选收集
      const offer = await tempConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });

      await tempConnection.setLocalDescription(offer);

      // 等待一段时间收集候选
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 分析NAT类型
      this.analyzeNATType(hasHostCandidate, srflxMappings, candidateCount);

      // 清理临时连接
      tempConnection.close();
    } catch (error) {
      console.error(`[WebRTCService.detectNATType] ❌ NAT检测失败:`, error);
      this.detectedNATType = 'unknown';
      this.isNATDetected = true;
    }
  }

  /**
   * 分析收集到的ICE候选，确定NAT类型
   *
   * 检测逻辑：
   * 1. 没有srflx候选 → UDP被阻止或STUN不可达
   * 2. 有srflx候选，但不同STUN返回不同端口 → 对称NAT（Symmetric NAT）
   * 3. 有srflx候选，所有STUN返回相同映射 → 锥形NAT（Cone NAT）
   * 4. 只有host候选，没有srflx → 可能是公网IP或UDP被阻止
   */
  private analyzeNATType(
    hasHost: boolean,
    srflxMappings: { ip: string; port: number }[],
    count: number,
  ): void {
    let natType: string;
    const hasSrflx = srflxMappings.length > 0;

    if (!hasSrflx && !hasHost) {
      natType = 'blocked'; // 完全阻塞
      console.warn(
        `[WebRTCService.analyzeNATType] ⚠️ 检测到网络可能被严重限制，无法收集任何候选`,
      );
    } else if (hasSrflx) {
      // 检查是否为对称NAT：不同STUN服务器返回的映射端口是否不同
      const ports = srflxMappings.map((m) => m.port);
      const uniquePorts = new Set(ports);
      const uniqueIPs = new Set(srflxMappings.map((m) => m.ip));

      if (uniquePorts.size > 1 || uniqueIPs.size > 1) {
        // 不同STUN返回了不同的映射端口/IP → 对称NAT
        natType = 'symmetric';
        console.warn(
          `[WebRTCService.analyzeNATType] ⚠️ 检测到对称NAT(Symmetric NAT) - 不同STUN返回不同映射:`,
        );
        console.warn(
          `  srflx映射列表: ${srflxMappings
            .map((m) => `${m.ip}:${m.port}`)
            .join(', ')}`,
        );
        console.warn(`  对称NAT环境下P2P连接可能失败，建议配置TURN中继服务器`);
      } else {
        // 所有STUN返回相同映射 → 锥形NAT（各种类型）
        natType = 'cone';
        console.log(
          `[WebRTCService.analyzeNATType] ✅ 检测到锥形NAT(Cone NAT)，穿透性较好`,
        );
        console.log(
          `  统一映射地址: ${srflxMappings[0]?.ip}:${srflxMappings[0]?.port}`,
        );
      }
    } else if (hasHost && !hasSrflx) {
      natType = 'public'; // 公网IP或UDP被阻止
      console.log(
        `[WebRTCService.analyzeNATType] ⚠️ 只有host候选，无srflx候选 - 可能是公网IP或STUN不可达`,
      );
    } else {
      natType = 'unknown';
      console.log(`[WebRTCService.analyzeNATType] 无法确定NAT类型`);
    }

    this.detectedNATType = natType;
    this.isNATDetected = true;

    // 根据NAT类型调整配置
    adjustConfigForNATType(natType, this.runtimeConfig);
  }
}
