import { invoke } from '@tauri-apps/api/core';
import { WebRTCSignalMessage } from '@workspace/types';
import { nanoid } from 'nanoid';

/**
 * WebRTC 默认配置 - NAT穿透优化版
 *
 * 【NAT穿透原理】
 * NAT（网络地址转换）特点：
 * - 内部IP:Port映射到外部IP:Port，但可能限制外部来源
 * - 不同的NAT类型穿透难度不同
 * - 对称型NAT（Symmetric NAT）最难穿透，双方都是对称NAT时需要TURN中继
 *
 * 【现代WebRTC如何支持NAT穿透】
 * 1. STUN服务器发现公网映射地址（srflx候选）
 * 2. 同时发送host候选和srflx候选给对方
 * 3. 双方尝试所有候选对（candidate pairs）
 * 4. 利用NAT的"打孔"特性：一旦建立映射，双向通信都可进行
 * 5. 某些路由器支持hairpinning（环回），host候选也能工作
 *
 * 【关键配置】
 * - iceTransportPolicy: 'all' - 使用所有候选类型（host、srflx）
 * - bundlePolicy: 'max-bundle' - 复用传输通道
 * - iceCandidatePoolSize: 10 - 预收集10个候选
 *
 * 【STUN服务器选择原则】
 * - 只保留2-3个高可用STUN服务器，过多会导致ICE收集延迟
 * - 浏览器会并行连接所有STUN服务器，不可用的服务器会阻塞收集
 * - Google STUN服务器最稳定，优先使用
 * - 国内STUN服务器作为备选，解决国内访问Google慢的问题
 *
 * 【重要说明】
 * - 不使用TURN/relay服务器（纯P2P），但预留了配置入口
 * - 只过滤relay候选，保留host和srflx候选
 * - WebRTC会自动按优先级尝试所有候选对
 * - 不要人为过滤候选类型，让浏览器自动决策
 * 
 * 【对称NAT问题】
 * - 如果双方都在对称NAT后面，仅靠STUN无法穿透
 * - 此时需要TURN中继服务器作为fallback
 * - 检测方法：不同STUN服务器返回不同的映射端口 = 对称NAT
 */
const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // ========== Google STUN 服务器 (最稳定) ==========
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },

    // ========== 国内STUN服务器（国内用户优先使用） ==========
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },

    // ========== 其他公共STUN服务器 ==========
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.skype.com:3478' },

    // ========== TURN服务器（对称NAT穿透必需） ==========
    // 如果双方都在对称NAT后面，必须使用TURN中继
    // 取消下面的注释并填入你的TURN服务器信息即可启用
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your-username',
    //   credential: 'your-credential',
    // },
    // {
    //   urls: 'turns:your-turn-server.com:5349',  // TURN over TLS
    //   username: 'your-username',
    //   credential: 'your-credential',
    // },
  ],
  iceTransportPolicy: 'all', // 使用所有候选类型
  bundlePolicy: 'max-bundle', // 最大复用
  rtcpMuxPolicy: 'require', // 要求 RTCP 复用
  iceCandidatePoolSize: 10, // 预收集候选池大小
};

/**
 * 创建WebRTC连接的配置对象
 * 返回一个新的RTCConfiguration实例，包含优化的ICE和媒体束策略
 */
const createWebRTCConfig = (): RTCConfiguration => {
  return {
    ...DEFAULT_WEBRTC_CONFIG,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
  };
};

/**
 * WebRTC 服务类
 *
 * 职责：
 * 1. 管理RTCPeerConnection连接的生命周期(创建、关闭)
 * 2. 处理WebRTC信令交换(offer/answer/candidate)
 * 3. 创建和管理RTCDataChannel数据通道
 * 4. 处理信令消息的收发和事件回调
 * 5. 提供连接状态查询接口
 *
 * 流程：
 * 发起方: createOffer() -> sendSignal(offer) -> handleAnswer() -> handleCandidate() -> 建立连接
 * 响应方: handleOffer() -> sendSignal(answer) -> handleCandidate() -> 建立连接
 */
class WebRTCService {
  /** 存储所有RTCPeerConnection连接, key为friendId */
  private connections: Map<string, RTCPeerConnection> = new Map();
  /** 存储所有RTCDataChannel数据通道, key为friendId */
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  /** 当前会话的唯一标识符，由nanoid生成 */
  public sessionId: string;
  /** 当前用户的ID */
  private localUserId: string;
  /** 接收到对端消息时的回调函数: (来源friendId, 消息内容) => void */
  private onMessageCallback:
    | ((friendId: string, message: string) => void)
    | null = null;
  /** 连接状态变化时的回调函数: (来源friendId, 连接状态) => void */
  private onConnectionStateChange:
    | ((friendId: string, state: RTCPeerConnectionState) => void)
    | null = null;
  /** 本地媒体流 */
  private localStream: MediaStream | null = null;
  /** 远程媒体流映射, key为friendId */
  private remoteStreams: Map<string, MediaStream> = new Map();
  /** 接收到远程媒体流时的回调函数: (来源friendId, 媒体流) => void */
  private onRemoteStreamCallback:
    | ((friendId: string, stream: MediaStream) => void)
    | null = null;
  /** 视频轨道状态 */
  private isVideoEnabled: boolean = true;
  /** 音频轨道状态 */
  private isAudioEnabled: boolean = true;
  /** ICE重启计时器映射, key为friendId */
  private iceRestartTimers: Map<string, NodeJS.Timeout> = new Map();
  /** ICE连接超时计时器映射, key为friendId */
  private iceTimeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  /** ICE重启次数映射, key为friendId */
  private iceRestartCount: Map<string, number> = new Map();
  /** 是否等待ICE收集完成后发送完整SDP（true=完整模式，false=Trickle ICE模式） */
  private useCompleteSDP: boolean = true;

  /** 收集到的本地ICE候选缓存，用于Trickle ICE模式 */
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  /** 最大ICE重启次数 */
  private static MAX_ICE_RESTART_COUNT = 3;
  /** ICE连接超时时间 (毫秒) */
  private static ICE_CONNECTION_TIMEOUT = 30000; // 30秒
  /** ICE重启间隔时间 (毫秒) */
  private static ICE_RESTART_INTERVAL = 5000; // 5秒后重试
  /** 检测到的NAT类型 */
  private detectedNATType: string | null = null;
  /** 是否已完成NAT检测 */
  private isNATDetected: boolean = false;

  /**
   * 构造函数
   * @param localUserId 当前用户ID
   */
  constructor(localUserId: string) {
    this.localUserId = localUserId;
    this.sessionId = nanoid(); // 生成唯一的会话ID
    console.log(
      `[WebRTCService] 初始化成功 - 用户ID: ${localUserId}, 会话ID: ${this.sessionId}`,
    );

    // 异步检测NAT类型（不阻塞初始化）
    this.detectNATType();
  }

  /**
   * 设置消息接收回调
   * @param callback 收到DataChannel消息时触发的回调函数
   */
  setOnMessageCallback(callback: (friendId: string, message: string) => void) {
    this.onMessageCallback = callback;
    console.log(`[WebRTCService] 消息回调已设置`);
  }

  /**
   * 设置连接状态变化回调
   * @param callback RTCPeerConnection状态变化时触发的回调函数
   */
  setOnConnectionStateChange(
    callback: (friendId: string, state: RTCPeerConnectionState) => void,
  ) {
    this.onConnectionStateChange = callback;
    console.log(`[WebRTCService] 连接状态变化回调已设置`);
  }

  /**
   * 设置远程媒体流接收回调
   * @param callback 收到远程媒体流时触发的回调函数
   */
  setOnRemoteStreamCallback(
    callback: (friendId: string, stream: MediaStream) => void,
  ) {
    this.onRemoteStreamCallback = callback;
    console.log(`[WebRTCService] 远程媒体流回调已设置`);
  }

  /**
   * 获取本地媒体流
   * @returns 本地媒体流
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * 获取远程媒体流
   * @param friendId 对端用户ID
   * @returns 远程媒体流
   */
  getRemoteStream(friendId: string): MediaStream | null {
    return this.remoteStreams.get(friendId) || null;
  }

  /**
   * 初始化本地媒体流
   * @param video 是否启用视频
   * @param audio 是否启用音频
   * @returns 本地媒体流
   */
  async initLocalStream(
    video: boolean = true,
    audio: boolean = true,
  ): Promise<MediaStream> {
    console.log(
      `[WebRTCService.initLocalStream] 初始化本地媒体流 - 视频: ${video}, 音频: ${audio}`,
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
              frameRate: { ideal: 30 },
            }
          : false,
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
      });

      this.localStream = stream;
      this.isVideoEnabled = video;
      this.isAudioEnabled = audio;
      console.log(`[WebRTCService.initLocalStream] ✅ 本地媒体流初始化成功`);
      return stream;
    } catch (error) {
      console.error(
        `[WebRTCService.initLocalStream] ❌ 初始化本地媒体流失败:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 关闭本地媒体流
   */
  closeLocalStream(): void {
    console.log(`[WebRTCService.closeLocalStream] 关闭本地媒体流...`);
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`[WebRTCService.closeLocalStream] 停止轨道: ${track.kind}`);
      });
      this.localStream = null;
    }
  }

  /**
   * 切换视频轨道状态
   * @returns 切换后的视频状态
   */
  toggleVideo(): boolean {
    console.log(`[WebRTCService.toggleVideo] 切换视频状态...`);
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.isVideoEnabled = !this.isVideoEnabled;
        videoTrack.enabled = this.isVideoEnabled;
        console.log(
          `[WebRTCService.toggleVideo] ✅ 视频状态已切换为: ${
            this.isVideoEnabled ? '开启' : '关闭'
          }`,
        );
        return this.isVideoEnabled;
      }
    }
    console.log(`[WebRTCService.toggleVideo] ⚠️ 没有视频轨道`);
    return false;
  }

  /**
   * 切换音频轨道状态
   * @returns 切换后的音频状态
   */
  toggleAudio(): boolean {
    console.log(`[WebRTCService.toggleAudio] 切换音频状态...`);
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        this.isAudioEnabled = !this.isAudioEnabled;
        audioTrack.enabled = this.isAudioEnabled;
        console.log(
          `[WebRTCService.toggleAudio] ✅ 音频状态已切换为: ${
            this.isAudioEnabled ? '开启' : '关闭'
          }`,
        );
        return this.isAudioEnabled;
      }
    }
    console.log(`[WebRTCService.toggleAudio] ⚠️ 没有音频轨道`);
    return false;
  }

  /**
   * 获取视频状态
   */
  getVideoEnabled(): boolean {
    return this.isVideoEnabled;
  }

  /**
   * 获取音频状态
   */
  getAudioEnabled(): boolean {
    return this.isAudioEnabled;
  }

  /**
   * 创建与对端的RTCPeerConnection连接
   *
   * 过程：
   * 1. 使用WebRTC配置创建RTCPeerConnection
   * 2. 设置ICE候选事件处理器
   * 3. 设置连接状态变化事件处理器
   * 4. 设置远程DataChannel接收事件处理器
   *
   * @param friendId 对端用户ID
   * @returns 创建的RTCPeerConnection连接对象
   */
  async createConnection(friendId: string): Promise<RTCPeerConnection> {
    console.log(
      `[WebRTCService.createConnection] 🚀 开始为 ${friendId} 创建连接...`,
    );

    const config = createWebRTCConfig();
    console.log(`[WebRTCService.createConnection] WebRTC配置:`, {
      iceServersCount: config.iceServers?.length || 0,
      iceTransportPolicy: config.iceTransportPolicy,
      bundlePolicy: config.bundlePolicy,
      iceCandidatePoolSize: config.iceCandidatePoolSize,
    });

    const connection = new RTCPeerConnection(config);
    console.log(
      `[WebRTCService.createConnection] ✅ RTCPeerConnection 对象已创建`,
    );

    // 存储连接对象供后续使用
    this.connections.set(friendId, connection);

    // 初始化ICE重启计数
    this.iceRestartCount.set(friendId, 0);

    /**
     * ICE候选事件处理器
     * 当浏览器收集到ICE候选地址时触发
     * 需要将候选信息通过信令通道发送给对端
     *
     * NAT3穿透关键：必须发送所有类型的候选（host、srflx），让对端尝试所有组合
     */
    connection.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidateType = event.candidate.type;
        console.log(
          `[WebRTCService.onicecandidate] 📍 收集到ICE候选 - 类型: ${candidateType}, 地址: ${event.candidate.address}:${event.candidate.port}, 协议: ${event.candidate.protocol || '未知'}`,
        );

        // relay候选：如果没有TURN服务器配置，跳过
        if (candidateType === 'relay') {
          const hasTurnServer = DEFAULT_WEBRTC_CONFIG.iceServers?.some(
            server => typeof server.urls === 'string'
              ? server.urls.startsWith('turn:') || server.urls.startsWith('turns:')
              : Array.isArray(server.urls) && server.urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))
          ) ?? false;
          if (!hasTurnServer) {
            console.log(
              `[WebRTCService.onicecandidate] ⏭️ 跳过中继候选(relay candidate) - 未配置TURN服务器`,
            );
            return;
          }
          console.log(
            `[WebRTCService.onicecandidate] ✅ 保留relay候选 - TURN服务器可用`,
          );
        }

        if (this.useCompleteSDP) {
          // 完整SDP模式：不单独发送候选，候选已包含在SDP中
          // waitForIceGathering 会等待所有候选收集完成后发送完整SDP
          console.log(
            `[WebRTCService.onicecandidate] 📦 完整SDP模式 - 候选将包含在SDP中，不单独发送`,
          );
        } else {
          // Trickle ICE模式：逐个发送候选给对端
          const signalMessage: WebRTCSignalMessage = {
            type: 'candidate',
            sender: this.localUserId,
            receiver: friendId,
            sessionId: this.sessionId,
            data: event.candidate.toJSON(),
            timestamp: Date.now(),
          };

          console.log(
            `[WebRTCService.onicecandidate] 📤 Trickle ICE - 发送ICE候选给 ${friendId} - 类型: ${candidateType}`,
          );
          await this.sendSignal(signalMessage);
        }
      } else {
        console.log(
          `[WebRTCService.onicecandidate] 🏁 ICE候选收集完成 - 总共收集了 ${this.connections.get(friendId)?.localDescription?.sdp?.split('\n').filter(line => line.startsWith('a=candidate:')).length || 0} 个候选`,
        );
      }
    };

    /**
     * 连接状态变化事件处理器
     * 监听RTCPeerConnection的连接状态
     * connecting -> connected -> disconnected/closed/failed
     */
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      const iceState = connection.iceConnectionState;
      const gatheringState = connection.iceGatheringState;
      
      console.log(
        `[WebRTCService.onconnectionstatechange] 🔄 连接状态变化:`,
      );
      console.log(`  - 连接状态 (connectionState): ${state}`);
      console.log(`  - ICE状态 (iceConnectionState): ${iceState}`);
      console.log(`  - 收集状态 (iceGatheringState): ${gatheringState}`);
      console.log(`  - 信令状态 (signalingState): ${connection.signalingState}`);
      
      // 打印当前候选对统计
      this.logCandidatePairStats(friendId, connection);

      // 触发状态变化回调，供UI层更新显示
      this.onConnectionStateChange?.(friendId, state);

      // 根据状态处理ICE重启和超时
      this.handleConnectionStateChange(friendId, state);
    };

    /**
     * ICE连接状态变化事件处理器
     * 用于更细粒度的ICE状态监控
     */
    connection.oniceconnectionstatechange = () => {
      console.log(
        `[WebRTCService.oniceconnectionstatechange] ICE连接状态: ${connection.iceConnectionState}`,
      );

      // 处理ICE失败，尝试重启
      if (connection.iceConnectionState === 'failed') {
        console.log(
          `[WebRTCService.oniceconnectionstatechange] ICE连接失败，尝试重启ICE...`,
        );
        // 如果检测到对称NAT，给出明确提示
        if (this.detectedNATType === 'symmetric') {
          console.error(
            `[WebRTCService.oniceconnectionstatechange] ⚠️ 本端检测到对称NAT，如果对端也是对称NAT，则必须配置TURN中继服务器才能连接`,
          );
          console.error(
            `[WebRTCService.oniceconnectionstatechange] 💡 请在 DEFAULT_WEBRTC_CONFIG.iceServers 中添加 TURN 服务器配置`,
          );
        }
        this.attemptIceRestart(friendId, connection);
      }
    };

    /**
     * 远程DataChannel接收事件处理器
     * 响应方会在此处接收发起方创建的DataChannel
     * 发起方通过createOffer时主动创建DataChannel
     */
    connection.ondatachannel = (event) => {
      console.log(
        `[WebRTCService.ondatachannel] 接收到远程DataChannel: ${event.channel.label}`,
      );
      this.setupDataChannel(friendId, event.channel);
    };

    /**
     * 远程媒体轨道接收事件处理器
     * 当对端添加媒体轨道时触发
     */
    connection.ontrack = (event) => {
      console.log(
        `[WebRTCService.ontrack] 收到远程媒体轨道 - 类型: ${event.track.kind}, streams: ${event.streams.length}`,
      );
      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0];
        this.remoteStreams.set(friendId, remoteStream);
        console.log(`[WebRTCService.ontrack] ✅ 远程媒体流已保存，触发回调`);
        this.onRemoteStreamCallback?.(friendId, remoteStream);
      }
    };

    /**
     * 添加本地媒体轨道到连接
     */
    if (this.localStream) {
      console.log(`[WebRTCService.createConnection] 添加本地媒体轨道到连接...`);
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream) {
          connection.addTrack(track, this.localStream);
          console.log(
            `[WebRTCService.createConnection] 已添加轨道: ${track.kind}`,
          );
        }
      });
    } else {
      console.log(
        `[WebRTCService.createConnection] ⚠️ 本地媒体流未初始化，不添加媒体轨道`,
      );
    }

    // 启动ICE连接超时计时器
    this.startIceConnectionTimeout(friendId);

    console.log(
      `[WebRTCService.createConnection] 连接创建完成 - friendId: ${friendId}, 连接总数: ${this.connections.size}`,
    );
    return connection;
  }

  /**
   * 处理连接状态变化
   * 根据状态管理ICE超时和重启计时器
   * @param friendId 对端用户ID
   * @param state 当前连接状态
   */
  private handleConnectionStateChange(
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
        console.log(
          `[WebRTCService.handleConnectionStateChange] ⚠️  连接断开，尝试重启ICE...`,
        );
        this.attemptIceRestartWithDelay(friendId);
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
   * 启动ICE连接超时计时器
   * @param friendId 对端用户ID
   */
  private startIceConnectionTimeout(friendId: string): void {
    // 清除已有的超时计时器
    if (this.iceTimeoutTimers.has(friendId)) {
      clearTimeout(this.iceTimeoutTimers.get(friendId)!);
    }

    const timeout = setTimeout(() => {
      console.log(
        `[WebRTCService.startIceConnectionTimeout] ⏰ ICE连接超时 (${
          WebRTCService.ICE_CONNECTION_TIMEOUT / 1000
        }秒)，尝试重启...`,
      );
      this.attemptIceRestart(friendId, this.connections.get(friendId));
    }, WebRTCService.ICE_CONNECTION_TIMEOUT);

    this.iceTimeoutTimers.set(friendId, timeout);
    console.log(
      `[WebRTCService.startIceConnectionTimeout] 已启动ICE超时计时器，${
        WebRTCService.ICE_CONNECTION_TIMEOUT / 1000
      }秒后触发`,
    );
  }

  /**
   * 带延迟的ICE重启（用于disconnected/failed状态）
   * @param friendId 对端用户ID
   */
  private attemptIceRestartWithDelay(friendId: string): void {
    const connection = this.connections.get(friendId);
    if (!connection) return;

    const restartCount = this.iceRestartCount.get(friendId) || 0;

    if (restartCount >= WebRTCService.MAX_ICE_RESTART_COUNT) {
      console.log(
        `[WebRTCService.attemptIceRestartWithDelay] 已达到最大重启次数(${WebRTCService.MAX_ICE_RESTART_COUNT})，停止尝试`,
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
    }, WebRTCService.ICE_RESTART_INTERVAL);

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

    const restartCount = (this.iceRestartCount.get(friendId) || 0) + 1;

    if (restartCount > WebRTCService.MAX_ICE_RESTART_COUNT) {
      console.log(
        `[WebRTCService.attemptIceRestart] ❌ 已达到最大重启次数(${WebRTCService.MAX_ICE_RESTART_COUNT})，停止尝试`,
      );
      this.clearIceTimers(friendId);

      // 触发最终失败状态
      this.onConnectionStateChange?.(friendId, 'failed');
      return;
    }

    this.iceRestartCount.set(friendId, restartCount);
    console.log(
      `[WebRTCService.attemptIceRestart] 🔄 第${restartCount}/${WebRTCService.MAX_ICE_RESTART_COUNT}次尝试重启ICE...`,
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
        sender: this.localUserId,
        receiver: friendId,
        sessionId: this.sessionId,
        data: offer,
        timestamp: Date.now(),
      };

      await this.sendSignal(signalMessage);
      console.log(
        `[WebRTCService.attemptIceRestart] ✅ ICE重启信令已发送，等待对端响应...`,
      );

      // 重新启动超时计时器
      this.startIceConnectionTimeout(friendId);
    } catch (error) {
      console.error(`[WebRTCService.attemptIceRestart] ❌ ICE重启失败:`, error);

      // 如果还有重试机会，延迟后再次尝试
      if (restartCount < WebRTCService.MAX_ICE_RESTART_COUNT) {
        console.log(
          `[WebRTCService.attemptIceRestart] ⏳ ${
            WebRTCService.ICE_RESTART_INTERVAL / 1000
          }秒后进行第${restartCount + 1}次尝试...`,
        );
        setTimeout(() => {
          this.attemptIceRestartWithDelay(friendId);
        }, WebRTCService.ICE_RESTART_INTERVAL);
      } else {
        console.log(
          `[WebRTCService.attemptIceRestart] ❌ 已达到最大重启次数，放弃连接`,
        );
        this.onConnectionStateChange?.(friendId, 'failed');
      }
    }
  }

  /**
   * 清除所有ICE相关计时器
   * @param friendId 对端用户ID
   */
  private clearIceTimers(friendId: string): void {
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

  /**
   * 打印ICE候选对统计信息（用于调试）
   * @param friendId 对端用户ID
   * @param connection RTCPeerConnection对象
   */
  private async logCandidatePairStats(
    friendId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    try {
      const stats = await connection.getStats();
      let activeCandidatePair: any = null;
      let totalCandidatePairs = 0;
      let succeededPairs = 0;
      let failedPairs = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair') {
          totalCandidatePairs++;
          if (report.state === 'succeeded') {
            succeededPairs++;
            activeCandidatePair = report;
          } else if (report.state === 'failed') {
            failedPairs++;
          }
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
          console.log(`  - ✅ 活跃候选对详情:`);
          console.log(`    • 本地候选ID: ${pair.localCandidateId || pair.get('localCandidateId')}`);
          console.log(`    • 远程候选ID: ${pair.remoteCandidateId || pair.get('remoteCandidateId')}`);
          const rtt = pair.currentRoundTripTime ?? pair.get('currentRoundTripTime');
          console.log(`    • 往返延迟(RTT): ${rtt?.toFixed?.(3) || '未知'}s`);
          console.log(`    • 接收字节: ${(pair.bytesReceived ?? pair.get('bytesReceived')) || 0}`);
          console.log(`    • 发送字节: ${(pair.bytesSent ?? pair.get('bytesSent')) || 0}`);
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
  }

  /**
   * 获取连接对象
   * @param friendId 对端用户ID
   * @returns RTCPeerConnection对象或undefined
   */
  getConnection(friendId: string): RTCPeerConnection | undefined {
    return this.connections.get(friendId);
  }

  /**
   * 获取所有连接的状态摘要
   * @returns 连接状态摘要对象
   */
  getAllConnectionsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    this.connections.forEach((connection, friendId) => {
      summary[friendId] = {
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState,
        iceGatheringState: connection.iceGatheringState,
        signalingState: connection.signalingState,
        iceRestartCount: this.iceRestartCount.get(friendId) || 0,
        hasLocalStream: !!this.localStream,
        hasRemoteStream: this.remoteStreams.has(friendId),
        dataChannelOpen: this.dataChannels.get(friendId)?.readyState === 'open',
      };
    });
    
    return summary;
  }

  /**
   * 打印详细的ICE连接诊断信息
   * @param friendId 对端用户ID
   * @param connection RTCPeerConnection对象
   */
  async logIceDiagnostics(
    friendId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    console.log(
      `[WebRTCService.logIceDiagnostics] 🔍 ICE连接诊断信息 [${friendId}]:`,
    );
    console.log(`  - 连接状态: ${connection.connectionState}`);
    console.log(`  - ICE状态: ${connection.iceConnectionState}`);
    console.log(`  - 收集状态: ${connection.iceGatheringState}`);
    console.log(`  - 信令状态: ${connection.signalingState}`);

    // 打印本地描述中的候选
    if (connection.localDescription?.sdp) {
      const localCandidates = connection.localDescription.sdp
        .split('\n')
        .filter((line) => line.startsWith('a=candidate:'));
      console.log(`  - 本地候选数: ${localCandidates.length}`);
      localCandidates.forEach((line, index) => {
        const parts = line.split(' ');
        if (parts.length >= 8) {
          console.log(
            `    ${index + 1}. ${parts[6]} - ${parts[4]}:${parts[5]} (${parts[2]})`,
          );
        }
      });
    }

    // 打印远程描述中的候选
    if (connection.remoteDescription?.sdp) {
      const remoteCandidates = connection.remoteDescription.sdp
        .split('\n')
        .filter((line) => line.startsWith('a=candidate:'));
      console.log(`  - 远程候选数: ${remoteCandidates.length}`);
      remoteCandidates.forEach((line, index) => {
        const parts = line.split(' ');
        if (parts.length >= 8) {
          console.log(
            `    ${index + 1}. ${parts[6]} - ${parts[4]}:${parts[5]} (${parts[2]})`,
          );
        }
      });
    }

    // 打印候选对统计
    await this.logCandidatePairStats(friendId, connection);
  }

  /**
   * 优化SDP以提高NAT穿透成功率
   *
   * 保守策略：不做任何SDP修改，让浏览器自动处理
   * 现代浏览器已经自动优化了ICE和NAT穿透
   *
   * @param sdp 原始SDP字符串
   * @returns 优化后的SDP字符串
   */
  private optimizeSDPForNAT(sdp: string): string {
    // 保守策略：直接返回原始SDP，不做任何修改
    // 浏览器已经自动处理了大部分NAT穿透优化
    // 修改SDP可能会导致格式错误
    console.log(`[WebRTCService.optimizeSDPForNAT] 使用原始SDP（保守模式）`);
    return sdp;
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
  private async detectNATType(): Promise<void> {
    console.log(`[WebRTCService.detectNATType] 开始检测NAT类型...`);

    try {
      const config = createWebRTCConfig();
      const tempConnection = new RTCPeerConnection(config);

      let hasHostCandidate = false;
      let candidateCount = 0;
      // 收集所有srflx候选的映射地址和端口，用于检测对称NAT
      const srflxMappings: { ip: string; port: number }[] = [];

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
      const ports = srflxMappings.map(m => m.port);
      const uniquePorts = new Set(ports);
      const uniqueIPs = new Set(srflxMappings.map(m => m.ip));

      if (uniquePorts.size > 1 || uniqueIPs.size > 1) {
        // 不同STUN返回了不同的映射端口/IP → 对称NAT
        natType = 'symmetric';
        console.warn(
          `[WebRTCService.analyzeNATType] ⚠️ 检测到对称NAT(Symmetric NAT) - 不同STUN返回不同映射:`,
        );
        console.warn(
          `  srflx映射列表: ${srflxMappings.map(m => `${m.ip}:${m.port}`).join(', ')}`,
        );
        console.warn(
          `  对称NAT环境下P2P连接可能失败，建议配置TURN中继服务器`,
        );
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
    this.adjustConfigForNATType(natType);
  }

  /**
   * 根据检测到的NAT类型调整配置参数
   * @param natType NAT类型
   */
  private adjustConfigForNATType(natType: string): void {
    switch (natType) {
      case 'symmetric':
        console.log(
          `[WebRTCService.adjustConfigForNATType] 🔄 检测到对称NAT(Symmetric NAT)，调整配置...`,
        );
        console.warn(
          `[WebRTCService.adjustConfigForNATType] ⚠️ 对称NAT穿透难度极高，双方都在对称NAT后时需要TURN中继`,
        );
        // 对称NAT环境下增加超时时间和重启次数
        WebRTCService.ICE_CONNECTION_TIMEOUT = 60000; // 增加到60秒
        WebRTCService.ICE_RESTART_INTERVAL = 8000; // 缩短到8秒，更频繁尝试
        WebRTCService.MAX_ICE_RESTART_COUNT = 5; // 增加到5次
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
        WebRTCService.ICE_CONNECTION_TIMEOUT = 90000; // 90秒
        WebRTCService.ICE_RESTART_INTERVAL = 5000; // 5秒
        WebRTCService.MAX_ICE_RESTART_COUNT = 7; // 允许更多重启
        break;

      default:
        console.log(`[WebRTCService.adjustConfigForNATType] 使用默认配置`);
        break;
    }

    console.log(`[WebRTCService.adjustConfigForNATType] 配置已调整:`);
    console.log(
      `  - 超时时间: ${WebRTCService.ICE_CONNECTION_TIMEOUT / 1000}秒`,
    );
    console.log(`  - 重启间隔: ${WebRTCService.ICE_RESTART_INTERVAL / 1000}秒`);
    console.log(`  - 最大重启次数: ${WebRTCService.MAX_ICE_RESTART_COUNT}次`);
  }

  /**
   * 获取检测到的NAT类型
   */
  getDetectedNATType(): string | null {
    return this.detectedNATType;
  }

  /**
   * 是否已完成NAT检测
   */
  isNATDetectionComplete(): boolean {
    return this.isNATDetected;
  }

  /**
   * 等待ICE候选收集完成
   * 对NAT3环境很重要，确保收集到所有可能的候选
   * 
   * @param connection RTCPeerConnection对象
   * @param timeout 超时时间（毫秒），默认5秒
   * @returns Promise，当候选收集完成或超时时resolve
   */
  private async waitForIceGathering(
    connection: RTCPeerConnection,
    timeout: number = 5000,
  ): Promise<void> {
    return new Promise((resolve) => {
      // 如果已经完成，直接返回
      if (connection.iceGatheringState === 'complete') {
        console.log('[WebRTCService.waitForIceGathering] ✅ ICE候选已收集完成');
        resolve();
        return;
      }

      console.log(`[WebRTCService.waitForIceGathering] ⏳ 等待ICE候选收集，当前状态: ${connection.iceGatheringState}`);

      // 设置超时
      const timer = setTimeout(() => {
        console.log('[WebRTCService.waitForIceGathering] ⏰ 等待超时，继续执行');
        // 清理监听器，避免内存泄漏
        connection.removeEventListener('icegatheringstatechange', onGatheringStateChange);
        resolve();
      }, timeout);

      // 使用addEventListener而非直接赋值，避免覆盖已有的处理器
      const onGatheringStateChange = () => {
        if (connection.iceGatheringState === 'complete') {
          console.log('[WebRTCService.waitForIceGathering] ✅ ICE候选收集完成');
          clearTimeout(timer);
          connection.removeEventListener('icegatheringstatechange', onGatheringStateChange);
          resolve();
        }
      };

      connection.addEventListener('icegatheringstatechange', onGatheringStateChange);
    });
  }

  /**
   * 发起方创建offer
   *
   * 流程：
   * 1. 查询或创建RTCPeerConnection
   * 2. 主动创建DataChannel
   * 3. 创建并设置本地offer描述
   * 4. 返回offer给应用层发送给对端
   *
   * @param friendId 对端用户ID
   * @returns RTCSessionDescriptionInit (offer)
   */
  async createOffer(friendId: string): Promise<RTCSessionDescriptionInit> {
    console.log(`[WebRTCService.createOffer] 🚀 开始为 ${friendId} 创建offer...`);

    let connection = this.connections.get(friendId);
    if (!connection) {
      console.log(`[WebRTCService.createOffer] 🔨 连接不存在，创建新连接`);
      connection = await this.createConnection(friendId);
    } else {
      console.log(`[WebRTCService.createOffer] ♻️ 使用已存在的连接`);
    }

    /**
     * 发起方创建DataChannel
     * ordered: true 保证消息顺序传递
     * 响应方会通过ondatachannel事件接收此通道
     */
    console.log(`[WebRTCService.createOffer] 📡 创建DataChannel...`);
    const dataChannel = connection.createDataChannel('webrtc-chat', {
      ordered: true,
    });
    this.setupDataChannel(friendId, dataChannel);
    console.log(`[WebRTCService.createOffer] ✅ DataChannel 已创建`);

    /**
     * 创建offer
     * offerToReceiveAudio/Video: true 接收对方的音频和视频
     */
    console.log(`[WebRTCService.createOffer] 📝 调用 createOffer()...`);
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    console.log(
      `[WebRTCService.createOffer] 📝 offer 已创建，SDP长度: ${
        offer.sdp?.length || 0
      }`,
    );

    // 输出SDP中的候选信息（用于调试）
    if (offer.sdp) {
      const candidateLines = offer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
      console.log(`[WebRTCService.createOffer] 📊 SDP中包含 ${candidateLines.length} 个ICE候选:`);
      candidateLines.forEach((line, index) => {
        // 提取候选类型和地址信息
        const parts = line.split(' ');
        if (parts.length >= 8) {
          const type = parts[6]; // 第7个字段是候选类型
          const address = parts[4]; // 第5个字段是地址
          const port = parts[5]; // 第6个字段是端口
          console.log(`  ${index + 1}. 类型: ${type}, 地址: ${address}:${port}`);
        }
      });
    }

    // 优化SDP以提高NAT穿透成功率
    if (offer.sdp) {
      offer.sdp = this.optimizeSDPForNAT(offer.sdp);
      console.log(
        `[WebRTCService.createOffer] 🔧 SDP已优化，新长度: ${offer.sdp.length}`,
      );
    }

    // 设置本地描述，告知WebRTC此端的能力
    console.log(`[WebRTCService.createOffer] ⚙️ 设置本地描述...`);
    await connection.setLocalDescription(offer);
    console.log(
      `[WebRTCService.createOffer] ✅ 本地描述已设置，连接状态: ${connection.connectionState}, ICE状态: ${connection.iceConnectionState}`,
    );

    // 【NAT3关键】等待ICE候选收集完成
    // 这确保offer中包含所有候选，对端可以立即尝试所有路径
    console.log(`[WebRTCService.createOffer] ⏳ 等待ICE候选收集完成（NAT3环境需要）...`);
    await this.waitForIceGathering(connection, 8000); // 等待最多8秒
    
    // 获取更新后的本地描述（包含所有候选）
    const finalOffer = connection.localDescription;
    if (finalOffer) {
      console.log(`[WebRTCService.createOffer] ✅ ICE候选收集完成，最终SDP长度: ${finalOffer.sdp?.length || 0}`);
      
      // 统计最终候选数量
      if (finalOffer.sdp) {
        const candidateLines = finalOffer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
        console.log(`[WebRTCService.createOffer] 📊 最终包含 ${candidateLines.length} 个ICE候选`);
        
        // 分类统计
        const hostCount = candidateLines.filter(line => line.includes(' host ')).length;
        const srflxCount = candidateLines.filter(line => line.includes(' srflx ')).length;
        console.log(`[WebRTCService.createOffer] 📊 候选类型分布: host=${hostCount}, srflx=${srflxCount}`);
      }
      
      return finalOffer;
    }

    return offer;
  }

  /**
   * 响应方处理offer
   *
   * 流程：
   * 1. 查询或创建RTCPeerConnection
   * 2. 设置远程offer作为远程描述
   * 3. 创建并设置本地answer描述
   * 4. 返回answer给应用层发送给对端
   *
   * @param friendId 对端用户ID
   * @param offer 发起方发来的offer
   * @returns RTCSessionDescriptionInit (answer)
   */
  async handleOffer(
    friendId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    console.log(
      `[WebRTCService.handleOffer] 📨 开始处理来自 ${friendId} 的offer...`,
    );

    let connection = this.connections.get(friendId);
    if (!connection) {
      console.log(`[WebRTCService.handleOffer] 🔨 连接不存在，创建新连接`);
      connection = await this.createConnection(friendId);
    } else {
      console.log(`[WebRTCService.handleOffer] ♻️ 使用已存在的连接`);
    }

    // 设置远程描述，表示接受对端的offer
    console.log(
      `[WebRTCService.handleOffer] ⚙️ 设置远程描述，SDP长度: ${
        offer.sdp?.length || 0
      }`,
    );
    
    // 分析offer中的候选信息
    if (offer.sdp) {
      const candidateLines = offer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
      console.log(`[WebRTCService.handleOffer] 📊 对端offer中包含 ${candidateLines.length} 个ICE候选:`);
      candidateLines.forEach((line, index) => {
        const parts = line.split(' ');
        if (parts.length >= 8) {
          const type = parts[6];
          const address = parts[4];
          const port = parts[5];
          console.log(`  ${index + 1}. 类型: ${type}, 地址: ${address}:${port}`);
        }
      });
    }
    
    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[WebRTCService.handleOffer] ✅ 远程描述已设置`);

    // 创建answer作为本端的回应
    console.log(`[WebRTCService.handleOffer] 📝 调用 createAnswer()...`);
    const answer = await connection.createAnswer();
    console.log(
      `[WebRTCService.handleOffer] 📝 answer 已创建，SDP长度: ${
        answer.sdp?.length || 0
      }`,
    );

    // 分析answer中的候选信息
    if (answer.sdp) {
      const candidateLines = answer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
      console.log(`[WebRTCService.handleOffer] 📊 本地answer中包含 ${candidateLines.length} 个ICE候选:`);
      candidateLines.forEach((line, index) => {
        const parts = line.split(' ');
        if (parts.length >= 8) {
          const type = parts[6];
          const address = parts[4];
          const port = parts[5];
          console.log(`  ${index + 1}. 类型: ${type}, 地址: ${address}:${port}`);
        }
      });
    }

    // 优化answer SDP
    if (answer.sdp) {
      answer.sdp = this.optimizeSDPForNAT(answer.sdp);
      console.log(
        `[WebRTCService.handleOffer] 🔧 Answer SDP已优化，新长度: ${answer.sdp.length}`,
      );
    }

    // 设置本地描述
    console.log(`[WebRTCService.handleOffer] ⚙️ 设置本地描述...`);
    await connection.setLocalDescription(answer);
    console.log(
      `[WebRTCService.handleOffer] ✅ 本地描述已设置，连接状态: ${connection.connectionState}, ICE状态: ${connection.iceConnectionState}`,
    );

    // 【NAT3关键】等待ICE候选收集完成
    console.log(`[WebRTCService.handleOffer] ⏳ 等待ICE候选收集完成（NAT3环境需要）...`);
    await this.waitForIceGathering(connection, 8000);
    
    // 获取更新后的本地描述（包含所有候选）
    const finalAnswer = connection.localDescription;
    if (finalAnswer) {
      console.log(`[WebRTCService.handleOffer] ✅ ICE候选收集完成，最终SDP长度: ${finalAnswer.sdp?.length || 0}`);
      
      // 统计最终候选数量
      if (finalAnswer.sdp) {
        const candidateLines = finalAnswer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
        console.log(`[WebRTCService.handleOffer] 📊 最终包含 ${candidateLines.length} 个ICE候选`);
        
        const hostCount = candidateLines.filter(line => line.includes(' host ')).length;
        const srflxCount = candidateLines.filter(line => line.includes(' srflx ')).length;
        console.log(`[WebRTCService.handleOffer] 📊 候选类型分布: host=${hostCount}, srflx=${srflxCount}`);
      }
      
      return finalAnswer;
    }

    return answer;
  }

  /**
   * 响应方处理offer后，处理对端的answer
   *
   * 流程：
   * 1. 查询已存在的连接
   * 2. 设置远程answer描述
   * 3. 至此双方都已交换媒体能力，后续等待ICE候选
   *
   * @param friendId 对端用户ID
   * @param answer 对端的answer
   */
  async handleAnswer(
    friendId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    console.log(
      `[WebRTCService.handleAnswer] 📨 开始处理来自 ${friendId} 的answer...`,
    );

    const connection = this.connections.get(friendId);
    if (!connection) {
      console.error(`[WebRTCService.handleAnswer] ❌ 未找到 ${friendId} 的连接`);
      throw new Error('未找到该联系人的连接');
    }

    // 分析answer中的候选信息
    if (answer.sdp) {
      const candidateLines = answer.sdp.split('\n').filter(line => line.startsWith('a=candidate:'));
      console.log(`[WebRTCService.handleAnswer] 📊 对端answer中包含 ${candidateLines.length} 个ICE候选:`);
      candidateLines.forEach((line, index) => {
        const parts = line.split(' ');
        if (parts.length >= 8) {
          const type = parts[6];
          const address = parts[4];
          const port = parts[5];
          console.log(`  ${index + 1}. 类型: ${type}, 地址: ${address}:${port}`);
        }
      });
    }

    // 设置远程描述
    console.log(
      `[WebRTCService.handleAnswer] ⚙️ 设置远程描述，SDP长度: ${
        answer.sdp?.length || 0
      }`,
    );
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log(
      `[WebRTCService.handleAnswer] ✅ 远程描述已设置，连接状态: ${connection.connectionState}, ICE状态: ${connection.iceConnectionState}`,
    );
  }

  /**
   * 处理对端的ICE候选
   *
   * 流程：
   * 1. 查询已存在的连接
   * 2. 创建RTCIceCandidate对象
   * 3. 【重要】不过滤任何候选类型（除了relay），全部添加到连接
   * 4. WebRTC会自动尝试所有候选对，找到最优路径
   *
   * NAT3穿透关键：
   * - 必须添加所有候选（host + srflx），让WebRTC自动选择最佳路径
   * - host候选：用于同局域网或hairpinning支持的情况
   * - srflx候选：用于NAT穿透的公网映射地址
   *
   * @param friendId 对端用户ID
   * @param candidate 对端发来的ICE候选
   */
  async handleCandidate(
    friendId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    // 提取候选类型用于日志
    const candidateType = candidate.candidate?.split(' ')[7] || '未知';
    const candidateAddress = candidate.candidate?.split(' ')[4] || '未知';
    const candidatePort = candidate.candidate?.split(' ')[5] || '未知';
    
    console.log(
      `[WebRTCService.handleCandidate] 📥 处理来自 ${friendId} 的ICE候选 - 类型: ${candidateType}, 地址: ${candidateAddress}:${candidatePort}`,
    );

    const connection = this.connections.get(friendId);
    if (!connection) {
      console.error(
        `[WebRTCService.handleCandidate] ❌ 未找到 ${friendId} 的连接`,
      );
      throw new Error('未找到该联系人的连接');
    }

    const iceCandidate = new RTCIceCandidate(candidate);
    
    // 只有在未配置TURN服务器时才跳过relay候选
    // 如果配置了TURN服务器，relay候选是对称NAT环境下的关键fallback路径
    const hasTurnServer = DEFAULT_WEBRTC_CONFIG.iceServers?.some(
      server => typeof server.urls === 'string'
        ? server.urls.startsWith('turn:') || server.urls.startsWith('turns:')
        : Array.isArray(server.urls) && server.urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))
    ) ?? false;

    if (iceCandidate.type === 'relay' && !hasTurnServer) {
      console.log(
        `[WebRTCService.handleCandidate] ⏭️ 跳过中继候选(relay candidate) - 未配置TURN服务器`,
      );
      return;
    }

    if (iceCandidate.type === 'relay' && hasTurnServer) {
      console.log(
        `[WebRTCService.handleCandidate] ✅ 添加relay候选 - TURN服务器可用，这是对称NAT穿透的fallback`,
      );
    }

    // 记录添加的候选类型
    if (iceCandidate.type === 'host') {
      console.log(
        `[WebRTCService.handleCandidate] ✅ 添加host候选 - 同局域网或hairpinning可能成功`,
      );
    } else if (iceCandidate.type === 'srflx') {
      console.log(
        `[WebRTCService.handleCandidate] ✅ 添加srflx候选 - NAT3穿透的关键（公网映射）`,
      );
    }

    // 添加候选到连接，WebRTC栈会尝试连接
    console.log(`[WebRTCService.handleCandidate] ⚙️ 添加ICE候选到连接...`);
    await connection.addIceCandidate(iceCandidate);
    console.log(
      `[WebRTCService.handleCandidate] ✅ ICE候选已添加，当前ICE状态: ${connection.iceConnectionState}`,
    );
  }

  /**
   * 设置DataChannel的事件处理器
   *
   * 处理的事件：
   * - onopen: 通道打开，可以开始发送数据
   * - onclose: 通道关闭，清理相关资源
   * - onmessage: 接收到对端消息
   * - onerror: 通道发生错误
   *
   * @param friendId 对端用户ID
   * @param channel RTCDataChannel对象
   */
  private setupDataChannel(friendId: string, channel: RTCDataChannel) {
    console.log(
      `[WebRTCService.setupDataChannel] 为 ${friendId} 设置DataChannel - Label: ${channel.label}, BufferedAmount: ${channel.bufferedAmount}`,
    );

    this.dataChannels.set(friendId, channel);

    /** DataChannel打开事件 */
    channel.onopen = () => {
      console.log(
        `[WebRTCService.ondatachannelopen] ✅ DataChannel已打开 (friendId: ${friendId}) - 现在可以发送消息`,
      );
      console.log(
        `[WebRTCService.ondatachannelopen] 通道详情 - readyState: ${channel.readyState}, bufferedAmount: ${channel.bufferedAmount}`,
      );
    };

    /** DataChannel关闭事件 */
    channel.onclose = () => {
      console.log(
        `[WebRTCService.ondatachannelclose] DataChannel已关闭 (friendId: ${friendId})`,
      );
      this.dataChannels.delete(friendId);
    };

    /** DataChannel接收消息事件 */
    channel.onmessage = (event) => {
      console.log(
        `[WebRTCService.ondatachannelmessage] ✉️  从${friendId}收到消息 - 内容: ${
          event.data
        }, 时间: ${new Date().toLocaleTimeString()}`,
      );
      // 触发消息回调，供应用层处理
      this.onMessageCallback?.(friendId, event.data);
    };

    /** DataChannel错误事件 */
    channel.onerror = (error) => {
      console.error(
        `[WebRTCService.ondatachannelerror] ❌ DataChannel错误 (friendId: ${friendId}) - ${error}`,
      );
    };

    /** DataChannel缓冲量变化事件 */
    channel.onbufferedamountlow = () => {
      console.log(
        `[WebRTCService.onbufferedamountlow] 缓冲区低水位事件 (friendId: ${friendId})`,
      );
    };

    console.log(
      `[WebRTCService.setupDataChannel] DataChannel设置完成，当前总数: ${this.dataChannels.size}`,
    );
  }

  /**
   * 通过DataChannel发送消息给对端
   *
   * @param friendId 对端用户ID
   * @param message 要发送的文本消息
   * @returns 是否发送成功 (true=成功, false=失败或通道未打开)
   */
  sendMessage(friendId: string, message: string): boolean {
    console.log(`[WebRTCService.sendMessage] 准备发送消息给 ${friendId}...`);

    const channel = this.dataChannels.get(friendId);

    // 检查通道是否存在且已打开
    if (!channel) {
      console.error(
        `[WebRTCService.sendMessage] ❌ 发送失败 - DataChannel不存在 (friendId: ${friendId})`,
      );
      return false;
    }

    if (channel.readyState !== 'open') {
      console.error(
        `[WebRTCService.sendMessage] ❌ 发送失败 - DataChannel未打开 (readyState: ${channel.readyState})`,
      );
      return false;
    }

    console.log(
      `[WebRTCService.sendMessage] ✅ DataChannel已就绪，发送消息: "${message}" (长度: ${message.length} 字符)`,
    );

    try {
      // 发送消息
      channel.send(message);
      console.log(
        `[WebRTCService.sendMessage] ✅ 消息发送成功，缓冲区大小: ${channel.bufferedAmount}`,
      );
      return true;
    } catch (error) {
      console.error(`[WebRTCService.sendMessage] ❌ 发送异常 - ${error}`);
      return false;
    }
  }

  /**
   * 发送WebRTC信令消息
   *
   * 信令消息通过Tauri的invoke调用Rust后端的send_text_msg命令发送
   * 后端会通过QUIC隧道将消息转发给对端
   * 消息类型为 MSG_TYPE_WEBRTC_SIGNAL = 100
   *
   * @param signalMessage WebRTC信令消息 (offer/answer/candidate)
   */
  async sendSignal(signalMessage: WebRTCSignalMessage): Promise<void> {
    try {
      const raw = JSON.stringify(signalMessage);
      console.log(
        `[WebRTCService.sendSignal] 准备发送${signalMessage.type}信令给 ${signalMessage.receiver}...`,
      );
      console.log(
        `[WebRTCService.sendSignal] 信令详情 - sessionId: ${signalMessage.sessionId}, 内容长度: ${raw.length}`,
      );

      // 通过Tauri invoke调用后端的send_text_msg命令
      await invoke('send_text_msg', {
        textQuicMsg: {
          nano_id: nanoid(), // 消息的唯一标识
          text_type: 100, // MSG_TYPE_WEBRTC_SIGNAL = 100
          raw: raw, // JSON序列化的信令消息
          recv_user: signalMessage.receiver, // 接收方用户ID
          send_user: signalMessage.sender, // 发送方用户ID
          timestamp: signalMessage.timestamp, // 时间戳
        },
      });

      console.log(
        `[WebRTCService.sendSignal] ✅ ${signalMessage.type}信令已通过QUIC发送，等待对端响应...`,
      );
    } catch (error) {
      console.error(`[WebRTCService.sendSignal] ❌ 发送信令失败 - ${error}`);
      throw error;
    }
  }

  /**
   * 关闭与指定对端的连接
   *
   * @param friendId 对端用户ID
   */
  async closeConnection(friendId: string): Promise<void> {
    console.log(
      `[WebRTCService.closeConnection] 开始关闭与 ${friendId} 的连接...`,
    );

    // 清除ICE相关计时器
    this.clearIceTimers(friendId);

    // 重置ICE重启计数
    this.iceRestartCount.delete(friendId);

    // 关闭数据通道
    const channel = this.dataChannels.get(friendId);
    if (channel) {
      console.log(`[WebRTCService.closeConnection] 关闭DataChannel...`);
      channel.close();
      this.dataChannels.delete(friendId);
      console.log(`[WebRTCService.closeConnection] DataChannel已关闭`);
    } else {
      console.log(
        `[WebRTCService.closeConnection] 该friendId不存在DataChannel`,
      );
    }

    // 关闭RTCPeerConnection
    const connection = this.connections.get(friendId);
    if (connection) {
      console.log(
        `[WebRTCService.closeConnection] 关闭RTCPeerConnection (当前状态: ${connection.connectionState})...`,
      );
      connection.close();
      this.connections.delete(friendId);
      console.log(`[WebRTCService.closeConnection] RTCPeerConnection已关闭`);
    } else {
      console.log(`[WebRTCService.closeConnection] 该friendId不存在连接`);
    }

    // 移除远程媒体流
    const remoteStream = this.remoteStreams.get(friendId);
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStreams.delete(friendId);
      console.log(`[WebRTCService.closeConnection] 远程媒体流已移除`);
    }

    console.log(
      `[WebRTCService.closeConnection] ✅ 连接已关闭，剩余连接数: ${this.connections.size}`,
    );
  }

  /**
   * 关闭所有连接
   * 用于窗口卸载或应用退出时清理资源
   */
  closeAllConnections(): void {
    console.log(
      `[WebRTCService.closeAllConnections] 开始关闭所有连接 (当前连接数: ${this.connections.size}, 通道数: ${this.dataChannels.size})...`,
    );

    // 关闭所有数据通道
    this.dataChannels.forEach((channel, friendId) => {
      console.log(
        `[WebRTCService.closeAllConnections] 关闭 ${friendId} 的DataChannel...`,
      );
      channel.close();
    });
    this.dataChannels.clear();
    console.log(`[WebRTCService.closeAllConnections] 所有DataChannel已关闭`);

    // 关闭所有连接
    this.connections.forEach((connection, friendId) => {
      console.log(
        `[WebRTCService.closeAllConnections] 关闭 ${friendId} 的RTCPeerConnection...`,
      );
      connection.close();
    });
    this.connections.clear();
    console.log(
      `[WebRTCService.closeAllConnections] 所有RTCPeerConnection已关闭`,
    );

    // 关闭所有远程媒体流
    this.remoteStreams.forEach((stream, friendId) => {
      console.log(
        `[WebRTCService.closeAllConnections] 关闭 ${friendId} 的远程媒体流...`,
      );
      stream.getTracks().forEach((track) => track.stop());
    });
    this.remoteStreams.clear();
    console.log(`[WebRTCService.closeAllConnections] 所有远程媒体流已关闭`);

    // 关闭本地媒体流
    this.closeLocalStream();

    console.log(`[WebRTCService.closeAllConnections] ✅ 所有连接已清理完成`);
  }

  /**
   * 查询与指定对端的连接状态
   * @param friendId 对端用户ID
   * @returns 连接状态 (connecting|connected|disconnected|closed|failed)
   */
  getConnectionState(friendId: string): RTCPeerConnectionState | null {
    const connection = this.connections.get(friendId);
    const state = connection?.connectionState || null;
    console.log(
      `[WebRTCService.getConnectionState] 查询 ${friendId} 的连接状态: ${state}`,
    );
    return state;
  }

  /**
   * 查询与指定对端的DataChannel是否已打开
   * @param friendId 对端用户ID
   * @returns true=已打开且可发送, false=未打开或不存在
   */
  isDataChannelOpen(friendId: string): boolean {
    const channel = this.dataChannels.get(friendId);
    const isOpen = channel?.readyState === 'open';
    console.log(
      `[WebRTCService.isDataChannelOpen] 检查 ${friendId} 的DataChannel状态: ${
        isOpen ? '✅ 打开' : '❌ 关闭'
      } (readyState: ${channel?.readyState || '不存在'})`,
    );
    return isOpen;
  }
}

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

export { WebRTCService };
