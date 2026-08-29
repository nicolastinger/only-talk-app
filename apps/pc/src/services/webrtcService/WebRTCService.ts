/**
 * WebRTC 服务类 —— 门面（编排器）
 *
 * 职责：
 * 1. 管理RTCPeerConnection连接的生命周期(创建、关闭)
 * 2. 处理WebRTC信令交换(offer/answer/candidate)
 * 3. 创建和管理RTCDataChannel数据通道
 * 4. 处理信令消息的收发和事件回调
 * 5. 提供连接状态查询接口
 *
 * 具体实现被拆分为专注模块：
 * - config        WebRTC / ICE 配置
 * - SdpHelper     SDP 优化与 ICE 收集等待
 * - Diagnostics   连接诊断与统计
 * - NatDetector   NAT 类型检测与配置调整
 * - IceConnector  ICE 超时/重启策略
 *
 * 流程：
 * 发起方: createOffer() -> sendSignal(offer) -> handleAnswer() -> handleCandidate() -> 建立连接
 * 响应方: handleOffer() -> sendSignal(answer) -> handleCandidate() -> 建立连接
 */
import { invoke } from '@tauri-apps/api/core';
import { WebRTCSignalMessage } from '@workspace/types';
import { nanoid } from 'nanoid';
import { createWebRTCConfig, hasTurnServer } from './config';
import {
  buildConnectionSummary,
  logCandidatePairStats,
  logIceDiagnostics,
} from './Diagnostics';
import {
  DEFAULT_ICE_RUNTIME_CONFIG,
  IceConnector,
  IceConnectorContext,
} from './IceConnector';
import { NatDetector } from './NatDetector';
import {
  countCandidatesByType,
  optimizeSDPForNAT,
  parseICECandidates,
  waitForIceGathering,
} from './SdpHelper';

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
  /** 是否等待ICE收集完成后发送完整SDP（true=完整模式，false=Trickle ICE模式） */
  private useCompleteSDP: boolean = true;

  /** ICE 超时/重启策略管理器 */
  private iceConnector: IceConnector;
  /** NAT 类型检测器 */
  private natDetector: NatDetector;

  /**
   * 构造函数
   * @param localUserId 当前用户ID
   */
  constructor(localUserId: string) {
    this.localUserId = localUserId;
    this.sessionId = nanoid(); // 生成唯一的会话ID

    // 运行时 ICE 配置：与 IceConnector / NatDetector 共享同一引用，
    // NAT 检测到对称/受困类型时会在原对象上调整，从而影响 ICE 重启策略。
    const runtimeConfig = { ...DEFAULT_ICE_RUNTIME_CONFIG };

    const ctx: IceConnectorContext = {
      getConnection: (friendId) => this.connections.get(friendId),
      sendSignal: (signal) => this.sendSignal(signal),
      onConnectionStateChange: (friendId, state) =>
        this.onConnectionStateChange?.(friendId, state),
      getLocalUserId: () => this.localUserId,
      getSessionId: () => this.sessionId,
    };

    this.iceConnector = new IceConnector(ctx, runtimeConfig);
    this.natDetector = new NatDetector(runtimeConfig);

    console.log(
      `[WebRTCService] 初始化成功 - 用户ID: ${localUserId}, 会话ID: ${this.sessionId}`,
    );

    // 异步检测NAT类型（不阻塞初始化）
    this.natDetector.detectNATType();
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
    this.iceConnector.reset(friendId);

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
          `[WebRTCService.onicecandidate] 📍 收集到ICE候选 - 类型: ${candidateType}, 地址: ${
            event.candidate.address
          }:${event.candidate.port}, 协议: ${
            event.candidate.protocol || '未知'
          }`,
        );

        // relay候选：如果没有TURN服务器配置，跳过
        if (candidateType === 'relay' && !hasTurnServer()) {
          console.log(
            `[WebRTCService.onicecandidate] ⏭️ 跳过中继候选(relay candidate) - 未配置TURN服务器`,
          );
          return;
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
          `[WebRTCService.onicecandidate] 🏁 ICE候选收集完成 - 总共收集了 ${
            this.connections
              .get(friendId)
              ?.localDescription?.sdp?.split('\n')
              .filter((line) => line.startsWith('a=candidate:')).length || 0
          } 个候选`,
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

      console.log(`[WebRTCService.onconnectionstatechange] 🔄 连接状态变化:`);
      console.log(`  - 连接状态 (connectionState): ${state}`);
      console.log(`  - ICE状态 (iceConnectionState): ${iceState}`);
      console.log(`  - 收集状态 (iceGatheringState): ${gatheringState}`);
      console.log(
        `  - 信令状态 (signalingState): ${connection.signalingState}`,
      );

      // 打印当前候选对统计
      logCandidatePairStats(friendId, connection);

      // 触发状态变化回调，供UI层更新显示
      this.onConnectionStateChange?.(friendId, state);

      // 根据状态处理ICE重启和超时
      this.iceConnector.onConnectionStateChange(friendId, state);
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
        if (this.natDetector.getDetectedNATType() === 'symmetric') {
          console.error(
            `[WebRTCService.oniceconnectionstatechange] ⚠️ 本端检测到对称NAT，如果对端也是对称NAT，则必须配置TURN中继服务器才能连接`,
          );
          console.error(
            `[WebRTCService.oniceconnectionstatechange] 💡 请在 DEFAULT_WEBRTC_CONFIG.iceServers 中添加 TURN 服务器配置`,
          );
        }
        this.iceConnector.onIceConnectionStateChange(friendId, connection);
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
    this.iceConnector.startIceConnectionTimeout(friendId);

    console.log(
      `[WebRTCService.createConnection] 连接创建完成 - friendId: ${friendId}, 连接总数: ${this.connections.size}`,
    );
    return connection;
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
    return buildConnectionSummary(
      this.connections,
      this.dataChannels,
      this.iceConnector.getRestartCountMap(),
      !!this.localStream,
      this.remoteStreams,
    );
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
    await logIceDiagnostics(friendId, connection);
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
    console.log(
      `[WebRTCService.createOffer] 🚀 开始为 ${friendId} 创建offer...`,
    );

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
      const candidates = parseICECandidates(offer.sdp);
      console.log(
        `[WebRTCService.createOffer] 📊 SDP中包含 ${candidates.length} 个ICE候选:`,
      );
      candidates.forEach((c, index) => {
        console.log(
          `  ${index + 1}. 类型: ${c.type}, 地址: ${c.address}:${c.port}`,
        );
      });
    }

    // 优化SDP以提高NAT穿透成功率
    if (offer.sdp) {
      offer.sdp = optimizeSDPForNAT(offer.sdp);
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
    console.log(
      `[WebRTCService.createOffer] ⏳ 等待ICE候选收集完成（NAT3环境需要）...`,
    );
    await waitForIceGathering(connection, 8000); // 等待最多8秒

    // 获取更新后的本地描述（包含所有候选）
    const finalOffer = connection.localDescription;
    if (finalOffer) {
      console.log(
        `[WebRTCService.createOffer] ✅ ICE候选收集完成，最终SDP长度: ${
          finalOffer.sdp?.length || 0
        }`,
      );

      // 统计最终候选数量
      if (finalOffer.sdp) {
        const { total, host, srflx } = countCandidatesByType(finalOffer.sdp);
        console.log(
          `[WebRTCService.createOffer] 📊 最终包含 ${total} 个ICE候选`,
        );
        console.log(
          `[WebRTCService.createOffer] 📊 候选类型分布: host=${host}, srflx=${srflx}`,
        );
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

    // 已有连接但信令非 stable（正在协商或乱序）时，丢弃该 offer，避免重协商冲突
    if (connection.signalingState !== 'stable') {
      console.log(
        `[WebRTCService.handleOffer] ⏭️ 连接非stable(${connection.signalingState})，丢弃该offer`,
      );
      return connection.localDescription ?? offer;
    }

    // 设置远程描述，表示接受对端的offer
    console.log(
      `[WebRTCService.handleOffer] ⚙️ 设置远程描述，SDP长度: ${
        offer.sdp?.length || 0
      }`,
    );

    // 分析offer中的候选信息
    if (offer.sdp) {
      const candidates = parseICECandidates(offer.sdp);
      console.log(
        `[WebRTCService.handleOffer] 📊 对端offer中包含 ${candidates.length} 个ICE候选:`,
      );
      candidates.forEach((c, index) => {
        console.log(
          `  ${index + 1}. 类型: ${c.type}, 地址: ${c.address}:${c.port}`,
        );
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
      const candidates = parseICECandidates(answer.sdp);
      console.log(
        `[WebRTCService.handleOffer] 📊 本地answer中包含 ${candidates.length} 个ICE候选:`,
      );
      candidates.forEach((c, index) => {
        console.log(
          `  ${index + 1}. 类型: ${c.type}, 地址: ${c.address}:${c.port}`,
        );
      });
    }

    // 优化answer SDP
    if (answer.sdp) {
      answer.sdp = optimizeSDPForNAT(answer.sdp);
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
    console.log(
      `[WebRTCService.handleOffer] ⏳ 等待ICE候选收集完成（NAT3环境需要）...`,
    );
    await waitForIceGathering(connection, 8000);

    // 获取更新后的本地描述（包含所有候选）
    const finalAnswer = connection.localDescription;
    if (finalAnswer) {
      console.log(
        `[WebRTCService.handleOffer] ✅ ICE候选收集完成，最终SDP长度: ${
          finalAnswer.sdp?.length || 0
        }`,
      );

      // 统计最终候选数量
      if (finalAnswer.sdp) {
        const { total, host, srflx } = countCandidatesByType(finalAnswer.sdp);
        console.log(
          `[WebRTCService.handleOffer] 📊 最终包含 ${total} 个ICE候选`,
        );
        console.log(
          `[WebRTCService.handleOffer] 📊 候选类型分布: host=${host}, srflx=${srflx}`,
        );
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
      console.error(
        `[WebRTCService.handleAnswer] ❌ 未找到 ${friendId} 的连接`,
      );
      throw new Error('未找到该联系人的连接');
    }

    // 仅当处于 have-local-offer 且连接未关闭时才能设置远程 answer，避免乱序/已关闭时的 DTLS 角色冲突
    if (
      connection.connectionState === 'closed' ||
      connection.signalingState !== 'have-local-offer'
    ) {
      console.warn(
        `[WebRTCService.handleAnswer] ⏭️ 连接状态异常(state=${connection.connectionState}, signaling=${connection.signalingState})，跳过setRemoteDescription`,
      );
      return;
    }

    // 分析answer中的候选信息
    if (answer.sdp) {
      const candidates = parseICECandidates(answer.sdp);
      console.log(
        `[WebRTCService.handleAnswer] 📊 对端answer中包含 ${candidates.length} 个ICE候选:`,
      );
      candidates.forEach((c, index) => {
        console.log(
          `  ${index + 1}. 类型: ${c.type}, 地址: ${c.address}:${c.port}`,
        );
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
    if (iceCandidate.type === 'relay' && !hasTurnServer()) {
      console.log(
        `[WebRTCService.handleCandidate] ⏭️ 跳过中继候选(relay candidate) - 未配置TURN服务器`,
      );
      return;
    }

    if (iceCandidate.type === 'relay' && hasTurnServer()) {
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
   * 信令消息通过Tauri的invoke调用Rust后端的send_webrtc_signal命令发送
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

      // 通过 Tauri invoke 调用后端的 send_webrtc_signal 命令（独立信令通道）
      await invoke('send_webrtc_signal', {
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

    // 清除ICE相关计时器与重启计数
    this.iceConnector.dispose(friendId);

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

    // 清理所有 ICE 计时器
    this.iceConnector.disposeAll();

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

  /**
   * 获取检测到的NAT类型
   */
  getDetectedNATType(): string | null {
    return this.natDetector.getDetectedNATType();
  }

  /**
   * 是否已完成NAT检测
   */
  isNATDetectionComplete(): boolean {
    return this.natDetector.isNATDetectionComplete();
  }
}

export { WebRTCService };
