/**
 * ICE 连接超时与重启策略管理器。
 *
 * 负责针对单个对端的 ICE 超时/重启计时与次数控制；
 * 通过构造函数注入上下文（IceConnectorContext）与运行时配置（IceRuntimeConfig），
 * 不反向引用 WebRTCService 内部字段。
 */
import { WebRTCSignalMessage } from '@workspace/types';

/** ICE 运行时可变配置（NAT 类型检测后可调整） */
export interface IceRuntimeConfig {
  /** ICE连接超时时间 (毫秒) */
  iceConnectionTimeout: number;
  /** ICE重启间隔时间 (毫秒) */
  iceRestartInterval: number;
  /** 最大ICE重启次数 */
  maxIceRestartCount: number;
}

/** 默认 ICE 运行时配置 */
export const DEFAULT_ICE_RUNTIME_CONFIG: IceRuntimeConfig = {
  iceConnectionTimeout: 30000, // 30秒
  iceRestartInterval: 5000, // 5秒后重试
  maxIceRestartCount: 3,
};

/** IceConnector 依赖的外部环境（由 WebRTCService 注入） */
export interface IceConnectorContext {
  /** 获取指定对端的连接对象 */
  getConnection(friendId: string): RTCPeerConnection | undefined;
  /** 发送 WebRTC 信令消息（offer/answer/candidate/end） */
  sendSignal(signal: WebRTCSignalMessage): Promise<void>;
  /** 通知连接状态变化（透传到 UI 回调） */
  onConnectionStateChange(
    friendId: string,
    state: RTCPeerConnectionState,
  ): void;
  /** 当前用户ID（用于构造信令消息） */
  getLocalUserId(): string;
  /** 当前会话ID（用于构造信令消息） */
  getSessionId(): string;
}

export class IceConnector {
  private ctx: IceConnectorContext;
  private config: IceRuntimeConfig;
  /** ICE重启计时器映射, key为friendId */
  private iceRestartTimers: Map<string, NodeJS.Timeout> = new Map();
  /** ICE连接超时计时器映射, key为friendId */
  private iceTimeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  /** ICE重启次数映射, key为friendId */
  private iceRestartCount: Map<string, number> = new Map();

  constructor(
    ctx: IceConnectorContext,
    config: IceRuntimeConfig = { ...DEFAULT_ICE_RUNTIME_CONFIG },
  ) {
    this.ctx = ctx;
    this.config = config;
  }

  /** 获取当前运行时配置 */
  getConfig(): IceRuntimeConfig {
    return this.config;
  }

  /** 更新运行时配置（NAT 类型检测结果驱动） */
  updateConfig(partial: Partial<IceRuntimeConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** 获取指定对端的 ICE 重启次数 */
  getRestartCount(friendId: string): number {
    return this.iceRestartCount.get(friendId) || 0;
  }

  /** 获取 ICE 重启次数映射（只读） */
  getRestartCountMap(): Map<string, number> {
    return this.iceRestartCount;
  }

  /** 新建连接时重置计数 */
  reset(friendId: string): void {
    this.iceRestartCount.set(friendId, 0);
  }

  /**
   * 处理连接状态变化
   * 根据状态管理ICE超时和重启计时器
   * @param friendId 对端用户ID
   * @param state 当前连接状态
   */
  onConnectionStateChange(
    friendId: string,
    state: RTCPeerConnectionState,
  ): void {
    switch (state) {
      case 'connected':
        console.log(
          `[WebRTCService.handleConnectionStateChange] ✅ 连接已建立，清除超时和重启计时器`,
        );
        this.clearIceTimers(friendId);
        break;
      case 'disconnected':
        // 断开常是瞬态：不再自动重启 ICE，避免触发重协商风暴/DTLS 角色冲突
        console.log(
          `[WebRTCService.handleConnectionStateChange] ⚠️  连接断开，等待恢复；如持续失败将以 failed 状态自动重启`,
        );
        break;
      case 'failed':
        console.log(
          `[WebRTCService.handleConnectionStateChange] ❌ 连接失败，尝试重启ICE...`,
        );
        this.attemptIceRestartWithDelay(friendId);
        break;
      case 'closed':
        console.log(
          `[WebRTCService.handleConnectionStateChange] 🔒 连接已关闭，清除所有计时器`,
        );
        this.clearIceTimers(friendId);
        break;
    }
  }

  /**
   * 处理 ICE 连接状态变化（oniceconnectionstatechange 触发）
   * @param friendId 对端用户ID
   * @param connection 连接对象
   */
  onIceConnectionStateChange(
    friendId: string,
    connection: RTCPeerConnection,
  ): void {
    if (connection.iceConnectionState === 'failed') {
      console.log(
        `[WebRTCService.oniceconnectionstatechange] ICE连接失败，尝试重启ICE...`,
      );
      // 如果检测到对称NAT，给出明确提示
      this.attemptIceRestart(friendId, connection);
    }
  }

  /**
   * 启动ICE连接超时计时器
   * @param friendId 对端用户ID
   */
  startIceConnectionTimeout(friendId: string): void {
    // 清除已有的超时计时器
    if (this.iceTimeoutTimers.has(friendId)) {
      clearTimeout(this.iceTimeoutTimers.get(friendId)!);
    }

    const timeout = setTimeout(() => {
      const conn = this.ctx.getConnection(friendId);
      // 连接未处于 stable（正在协商/已重启）时跳过兜底重启，避免重协商风暴
      if (conn && conn.signalingState !== 'stable') {
        console.log(
          `[WebRTCService.startIceConnectionTimeout] ⏰ 超时但连接非stable(${conn.signalingState})，跳过兜底重启`,
        );
        return;
      }
      console.log(
        `[WebRTCService.startIceConnectionTimeout] ⏰ ICE连接超时 (${
          this.config.iceConnectionTimeout / 1000
        }秒)，尝试重启...`,
      );
      this.attemptIceRestart(friendId, conn);
    }, this.config.iceConnectionTimeout);

    this.iceTimeoutTimers.set(friendId, timeout);
    console.log(
      `[WebRTCService.startIceConnectionTimeout] 已启动ICE超时计时器，${
        this.config.iceConnectionTimeout / 1000
      }秒后触发`,
    );
  }

  /**
   * 带延迟的ICE重启（用于disconnected/failed状态）
   * @param friendId 对端用户ID
   */
  private attemptIceRestartWithDelay(friendId: string): void {
    const connection = this.ctx.getConnection(friendId);
    if (!connection) return;

    const restartCount = this.getRestartCount(friendId);

    if (restartCount >= this.config.maxIceRestartCount) {
      console.log(
        `[WebRTCService.attemptIceRestartWithDelay] 已达到最大重启次数(${this.config.maxIceRestartCount})，停止尝试`,
      );
      return;
    }

    // 清除已有重启计时器
    if (this.iceRestartTimers.has(friendId)) {
      clearTimeout(this.iceRestartTimers.get(friendId)!);
    }

    const delay = setTimeout(() => {
      console.log(
        `[WebRTCService.attemptIceRestartWithDelay] 开始第${
          restartCount + 1
        }次ICE重启...`,
      );
      this.attemptIceRestart(friendId, connection);
    }, this.config.iceRestartInterval);

    this.iceRestartTimers.set(friendId, delay);
  }

  /**
   * 尝试重启ICE连接
   * 通过重新创建offer/answer来刷新ICE候选
   *
   * 重要：ICE重启不会创建新窗口，只是在同一个连接上重新协商
   *
   * @param friendId 对端用户ID
   * @param connection RTCPeerConnection对象
   */
  private async attemptIceRestart(
    friendId: string,
    connection: RTCPeerConnection | undefined,
  ): Promise<void> {
    if (!connection) {
      console.error(`[WebRTCService.attemptIceRestart] ❌ 连接不存在`);
      return;
    }

    // 仅当信令处于 stable 时才可重新协商，否则会触发 DTLS 角色冲突
    if (connection.signalingState !== 'stable') {
      console.log(
        `[WebRTCService.attemptIceRestart] ⏭️ 连接非stable(${connection.signalingState})，跳过本次重启`,
      );
      return;
    }

    const restartCount = this.getRestartCount(friendId) + 1;

    if (restartCount > this.config.maxIceRestartCount) {
      console.log(
        `[WebRTCService.attemptIceRestart] ❌ 已达到最大重启次数(${this.config.maxIceRestartCount})，停止尝试`,
      );
      this.clearIceTimers(friendId);

      // 触发最终失败状态
      this.ctx.onConnectionStateChange(friendId, 'failed');
      return;
    }

    this.iceRestartCount.set(friendId, restartCount);
    console.log(
      `[WebRTCService.attemptIceRestart] 🔄 第${restartCount}/${this.config.maxIceRestartCount}次尝试重启ICE...`,
    );

    try {
      // 清除旧的计时器
      this.clearIceTimers(friendId);

      // 创建新的offer并设置iceRestart选项
      // 这会在同一个连接上重新协商，不会创建新窗口
      const offer = await connection.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await connection.setLocalDescription(offer);
      console.log(`[WebRTCService.attemptIceRestart] ✅ ICE重启offer已创建`);

      // 发送新的offer给对端
      const signalMessage: WebRTCSignalMessage = {
        type: 'offer',
        sender: this.ctx.getLocalUserId(),
        receiver: friendId,
        sessionId: this.ctx.getSessionId(),
        data: offer,
        timestamp: Date.now(),
      };

      await this.ctx.sendSignal(signalMessage);
      console.log(
        `[WebRTCService.attemptIceRestart] ✅ ICE重启信令已发送，等待对端响应...`,
      );

      // 重新启动超时计时器
      this.startIceConnectionTimeout(friendId);
    } catch (error) {
      console.error(`[WebRTCService.attemptIceRestart] ❌ ICE重启失败:`, error);

      // 如果还有重试机会，延迟后再次尝试
      if (restartCount < this.config.maxIceRestartCount) {
        console.log(
          `[WebRTCService.attemptIceRestart] ⏳ ${
            this.config.iceRestartInterval / 1000
          }秒后进行第${restartCount + 1}次尝试...`,
        );
        setTimeout(() => {
          this.attemptIceRestartWithDelay(friendId);
        }, this.config.iceRestartInterval);
      } else {
        console.log(
          `[WebRTCService.attemptIceRestart] ❌ 已达到最大重启次数，放弃连接`,
        );
        this.ctx.onConnectionStateChange(friendId, 'failed');
      }
    }
  }

  /**
   * 清除所有ICE相关计时器
   * @param friendId 对端用户ID
   */
  clearIceTimers(friendId: string): void {
    // 清除超时计时器
    if (this.iceTimeoutTimers.has(friendId)) {
      clearTimeout(this.iceTimeoutTimers.get(friendId)!);
      this.iceTimeoutTimers.delete(friendId);
    }

    // 清除重启计时器
    if (this.iceRestartTimers.has(friendId)) {
      clearTimeout(this.iceRestartTimers.get(friendId)!);
      this.iceRestartTimers.delete(friendId);
    }

    console.log(`[WebRTCService.clearIceTimers] 所有ICE计时器已清除`);
  }

  /** 关闭连接时清理该对端的计时器与计数 */
  dispose(friendId: string): void {
    this.clearIceTimers(friendId);
    this.iceRestartCount.delete(friendId);
  }

  /** 清理全部计时器（应用退出/全部关闭时） */
  disposeAll(): void {
    this.iceRestartTimers.forEach((timer) => clearTimeout(timer));
    this.iceTimeoutTimers.forEach((timer) => clearTimeout(timer));
    this.iceRestartTimers.clear();
    this.iceTimeoutTimers.clear();
    this.iceRestartCount.clear();
  }
}
