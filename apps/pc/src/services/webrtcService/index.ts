import { invoke } from '@tauri-apps/api/core';
import { nanoid } from 'nanoid';
import { WebRTCSignalMessage } from '@workspace/types';

/**
 * WebRTC 默认配置
 * - iceServers: 包含国内外STUN服务器，用于获取公网IP(srflx候选)
 * - iceTransportPolicy: 'all' 接收所有类型的候选(host, srflx, relay等)
 * - bundlePolicy: 'max-bundle' 将所有媒体束复用到单个传输
 * 
 * 注意：不使用TURN服务器(relay候选被代码主动过滤)，仅用于P2P直连
 */
const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // 国内STUN服务器
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },
    { urls: 'stun:stun.hitv.com:3478' },
    // 国际STUN服务器
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
};

/**
 * 创建WebRTC连接的配置对象
 * 返回一个新的RTCConfiguration实例，包含ICE和媒体束策略
 */
const createWebRTCConfig = (): RTCConfiguration => {
  return {
    ...DEFAULT_WEBRTC_CONFIG,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
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
  private onMessageCallback: ((friendId: string, message: string) => void) | null = null;
  /** 连接状态变化时的回调函数: (来源friendId, 连接状态) => void */
  private onConnectionStateChange: ((friendId: string, state: RTCPeerConnectionState) => void) | null = null;
  /** 本地媒体流 */
  private localStream: MediaStream | null = null;
  /** 远程媒体流映射, key为friendId */
  private remoteStreams: Map<string, MediaStream> = new Map();
  /** 接收到远程媒体流时的回调函数: (来源friendId, 媒体流) => void */
  private onRemoteStreamCallback: ((friendId: string, stream: MediaStream) => void) | null = null;
  /** 视频轨道状态 */
  private isVideoEnabled: boolean = true;
  /** 音频轨道状态 */
  private isAudioEnabled: boolean = true;

  /**
   * 构造函数
   * @param localUserId 当前用户ID
   */
  constructor(localUserId: string) {
    this.localUserId = localUserId;
    this.sessionId = nanoid(); // 生成唯一的会话ID
    console.log(`[WebRTCService] 初始化成功 - 用户ID: ${localUserId}, 会话ID: ${this.sessionId}`);
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
  setOnConnectionStateChange(callback: (friendId: string, state: RTCPeerConnectionState) => void) {
    this.onConnectionStateChange = callback;
    console.log(`[WebRTCService] 连接状态变化回调已设置`);
  }

  /**
   * 设置远程媒体流接收回调
   * @param callback 收到远程媒体流时触发的回调函数
   */
  setOnRemoteStreamCallback(callback: (friendId: string, stream: MediaStream) => void) {
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
  async initLocalStream(video: boolean = true, audio: boolean = true): Promise<MediaStream> {
    console.log(`[WebRTCService.initLocalStream] 初始化本地媒体流 - 视频: ${video}, 音频: ${audio}`);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false
      });

      this.localStream = stream;
      this.isVideoEnabled = video;
      this.isAudioEnabled = audio;
      console.log(`[WebRTCService.initLocalStream] ✅ 本地媒体流初始化成功`);
      return stream;
    } catch (error) {
      console.error(`[WebRTCService.initLocalStream] ❌ 初始化本地媒体流失败:`, error);
      throw error;
    }
  }

  /**
   * 关闭本地媒体流
   */
  closeLocalStream(): void {
    console.log(`[WebRTCService.closeLocalStream] 关闭本地媒体流...`);
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
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
        console.log(`[WebRTCService.toggleVideo] ✅ 视频状态已切换为: ${this.isVideoEnabled ? '开启' : '关闭'}`);
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
        console.log(`[WebRTCService.toggleAudio] ✅ 音频状态已切换为: ${this.isAudioEnabled ? '开启' : '关闭'}`);
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
    console.log(`[WebRTCService.createConnection] 开始为 ${friendId} 创建连接...`);

    const config = createWebRTCConfig();
    const connection = new RTCPeerConnection(config);
    console.log(`[WebRTCService.createConnection] RTCPeerConnection 对象已创建`);

    // 存储连接对象供后续使用
    this.connections.set(friendId, connection);

    /**
     * ICE候选事件处理器
     * 当浏览器收集到ICE候选地址时触发
     * 需要将候选信息通过信令通道发送给对端
     */
    connection.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidateType = event.candidate.type;
        console.log(`[WebRTCService.onicecandidate] 收集到ICE候选 - 类型: ${candidateType}, 地址: ${event.candidate.address}:${event.candidate.port}`);

        // 跳过relay类型的候选(中继候选)，仅使用host和srflx候选
        if (candidateType === 'relay') {
          console.log(`[WebRTCService.onicecandidate] 跳过中继候选(relay candidate)`);
          return;
        }

        // 构建ICE候选信令消息并发送给对端
        const signalMessage: WebRTCSignalMessage = {
          type: 'candidate',
          sender: this.localUserId,
          receiver: friendId,
          sessionId: this.sessionId,
          data: event.candidate.toJSON(),
          timestamp: Date.now(),
        };

        console.log(`[WebRTCService.onicecandidate] 发送ICE候选给 ${friendId}`);
        await this.sendSignal(signalMessage);
      } else {
        console.log(`[WebRTCService.onicecandidate] ICE候选收集完成`);
      }
    };

    /**
     * 连接状态变化事件处理器
     * 监听RTCPeerConnection的连接状态
     * connecting -> connected -> disconnected/closed/failed
     */
    connection.onconnectionstatechange = () => {
      console.log(`[WebRTCService.onconnectionstatechange] 连接状态: ${connection.connectionState} (ICE状态: ${connection.iceConnectionState}, 收集状态: ${connection.iceGatheringState})`);
      // 触发状态变化回调，供UI层更新显示
      this.onConnectionStateChange?.(friendId, connection.connectionState);
    };

    /**
     * 远程DataChannel接收事件处理器
     * 响应方会在此处接收发起方创建的DataChannel
     * 发起方通过createOffer时主动创建DataChannel
     */
    connection.ondatachannel = (event) => {
      console.log(`[WebRTCService.ondatachannel] 接收到远程DataChannel: ${event.channel.label}`);
      this.setupDataChannel(friendId, event.channel);
    };

    /**
     * 远程媒体轨道接收事件处理器
     * 当对端添加媒体轨道时触发
     */
    connection.ontrack = (event) => {
      console.log(`[WebRTCService.ontrack] 收到远程媒体轨道 - 类型: ${event.track.kind}, streams: ${event.streams.length}`);
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
      this.localStream.getTracks().forEach(track => {
        if (this.localStream) {
          connection.addTrack(track, this.localStream);
          console.log(`[WebRTCService.createConnection] 已添加轨道: ${track.kind}`);
        }
      });
    } else {
      console.log(`[WebRTCService.createConnection] ⚠️ 本地媒体流未初始化，不添加媒体轨道`);
    }

    console.log(`[WebRTCService.createConnection] 连接创建完成 - friendId: ${friendId}, 连接总数: ${this.connections.size}`);
    return connection;
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
    console.log(`[WebRTCService.createOffer] 开始为 ${friendId} 创建offer...`);

    let connection = this.connections.get(friendId);
    if (!connection) {
      console.log(`[WebRTCService.createOffer] 连接不存在，创建新连接`);
      connection = await this.createConnection(friendId);
    } else {
      console.log(`[WebRTCService.createOffer] 使用已存在的连接`);
    }

    /**
     * 发起方创建DataChannel
     * ordered: true 保证消息顺序传递
     * 响应方会通过ondatachannel事件接收此通道
     */
    console.log(`[WebRTCService.createOffer] 创建DataChannel...`);
    const dataChannel = connection.createDataChannel('webrtc-chat', {
      ordered: true,
    });
    this.setupDataChannel(friendId, dataChannel);
    console.log(`[WebRTCService.createOffer] DataChannel 已创建`);

    /**
     * 创建offer
     * offerToReceiveAudio/Video: true 接收对方的音频和视频
     */
    console.log(`[WebRTCService.createOffer] 调用 createOffer()...`);
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    console.log(`[WebRTCService.createOffer] offer 已创建，SDP长度: ${offer.sdp?.length || 0}`);

    // 设置本地描述，告知WebRTC此端的能力
    console.log(`[WebRTCService.createOffer] 设置本地描述...`);
    await connection.setLocalDescription(offer);
    console.log(`[WebRTCService.createOffer] 本地描述已设置，连接状态: ${connection.connectionState}`);

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
  async handleOffer(friendId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    console.log(`[WebRTCService.handleOffer] 开始处理来自 ${friendId} 的offer...`);

    let connection = this.connections.get(friendId);
    if (!connection) {
      console.log(`[WebRTCService.handleOffer] 连接不存在，创建新连接`);
      connection = await this.createConnection(friendId);
    } else {
      console.log(`[WebRTCService.handleOffer] 使用已存在的连接`);
    }

    // 设置远程描述，表示接受对端的offer
    console.log(`[WebRTCService.handleOffer] 设置远程描述，SDP长度: ${offer.sdp?.length || 0}`);
    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[WebRTCService.handleOffer] 远程描述已设置`);

    // 创建answer作为本端的回应
    console.log(`[WebRTCService.handleOffer] 调用 createAnswer()...`);
    const answer = await connection.createAnswer();
    console.log(`[WebRTCService.handleOffer] answer 已创建，SDP长度: ${answer.sdp?.length || 0}`);

    // 设置本地描述
    console.log(`[WebRTCService.handleOffer] 设置本地描述...`);
    await connection.setLocalDescription(answer);
    console.log(`[WebRTCService.handleOffer] 本地描述已设置，连接状态: ${connection.connectionState}`);

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
  async handleAnswer(friendId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log(`[WebRTCService.handleAnswer] 开始处理来自 ${friendId} 的answer...`);

    const connection = this.connections.get(friendId);
    if (!connection) {
      console.error(`[WebRTCService.handleAnswer] 未找到 ${friendId} 的连接`);
      throw new Error('未找到该联系人的连接');
    }

    // 设置远程描述
    console.log(`[WebRTCService.handleAnswer] 设置远程描述，SDP长度: ${answer.sdp?.length || 0}`);
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log(`[WebRTCService.handleAnswer] 远程描述已设置，连接状态: ${connection.connectionState}`);
  }

  /**
   * 处理对端的ICE候选
   *
   * 流程：
   * 1. 查询已存在的连接
   * 2. 创建RTCIceCandidate对象
   * 3. 过滤relay类型候选
   * 4. 添加候选到连接
   *
   * ICE候选用于建立两个对等端之间的媒体路径
   *
   * @param friendId 对端用户ID
   * @param candidate 对端发来的ICE候选
   */
  async handleCandidate(friendId: string, candidate: RTCIceCandidateInit): Promise<void> {
    console.log(`[WebRTCService.handleCandidate] 处理来自 ${friendId} 的candidate - 类型: ${candidate.candidate?.split(' ')[7]}`);

    const connection = this.connections.get(friendId);
    if (!connection) {
      console.error(`[WebRTCService.handleCandidate] 未找到 ${friendId} 的连接`);
      throw new Error('未找到该联系人的连接');
    }

    const iceCandidate = new RTCIceCandidate(candidate);
    // 跳过relay类型的候选
    if (iceCandidate.type === 'relay') {
      console.log(`[WebRTCService.handleCandidate] 跳过中继候选(relay candidate)`);
      return;
    }

    // 添加候选到连接，WebRTC栈会尝试连接
    console.log(`[WebRTCService.handleCandidate] 添加ICE候选到连接...`);
    await connection.addIceCandidate(iceCandidate);
    console.log(`[WebRTCService.handleCandidate] ICE候选已添加`);
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
    console.log(`[WebRTCService.setupDataChannel] 为 ${friendId} 设置DataChannel - Label: ${channel.label}, BufferedAmount: ${channel.bufferedAmount}`);

    this.dataChannels.set(friendId, channel);

    /** DataChannel打开事件 */
    channel.onopen = () => {
      console.log(`[WebRTCService.ondatachannelopen] ✅ DataChannel已打开 (friendId: ${friendId}) - 现在可以发送消息`);
      console.log(`[WebRTCService.ondatachannelopen] 通道详情 - readyState: ${channel.readyState}, bufferedAmount: ${channel.bufferedAmount}`);
    };

    /** DataChannel关闭事件 */
    channel.onclose = () => {
      console.log(`[WebRTCService.ondatachannelclose] DataChannel已关闭 (friendId: ${friendId})`);
      this.dataChannels.delete(friendId);
    };

    /** DataChannel接收消息事件 */
    channel.onmessage = (event) => {
      console.log(`[WebRTCService.ondatachannelmessage] ✉️  从${friendId}收到消息 - 内容: ${event.data}, 时间: ${new Date().toLocaleTimeString()}`);
      // 触发消息回调，供应用层处理
      this.onMessageCallback?.(friendId, event.data);
    };

    /** DataChannel错误事件 */
    channel.onerror = (error) => {
      console.error(`[WebRTCService.ondatachannelerror] ❌ DataChannel错误 (friendId: ${friendId}) - ${error}`);
    };

    /** DataChannel缓冲量变化事件 */
    channel.onbufferedamountlow = () => {
      console.log(`[WebRTCService.onbufferedamountlow] 缓冲区低水位事件 (friendId: ${friendId})`);
    };

    console.log(`[WebRTCService.setupDataChannel] DataChannel设置完成，当前总数: ${this.dataChannels.size}`);
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
      console.error(`[WebRTCService.sendMessage] ❌ 发送失败 - DataChannel不存在 (friendId: ${friendId})`);
      return false;
    }

    if (channel.readyState !== 'open') {
      console.error(`[WebRTCService.sendMessage] ❌ 发送失败 - DataChannel未打开 (readyState: ${channel.readyState})`);
      return false;
    }

    console.log(`[WebRTCService.sendMessage] ✅ DataChannel已就绪，发送消息: "${message}" (长度: ${message.length} 字符)`);

    try {
      // 发送消息
      channel.send(message);
      console.log(`[WebRTCService.sendMessage] ✅ 消息发送成功，缓冲区大小: ${channel.bufferedAmount}`);
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
      console.log(`[WebRTCService.sendSignal] 准备发送${signalMessage.type}信令给 ${signalMessage.receiver}...`);
      console.log(`[WebRTCService.sendSignal] 信令详情 - sessionId: ${signalMessage.sessionId}, 内容长度: ${raw.length}`);

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

      console.log(`[WebRTCService.sendSignal] ✅ ${signalMessage.type}信令已通过QUIC发送，等待对端响应...`);
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
    console.log(`[WebRTCService.closeConnection] 开始关闭与 ${friendId} 的连接...`);

    // 关闭数据通道
    const channel = this.dataChannels.get(friendId);
    if (channel) {
      console.log(`[WebRTCService.closeConnection] 关闭DataChannel...`);
      channel.close();
      this.dataChannels.delete(friendId);
      console.log(`[WebRTCService.closeConnection] DataChannel已关闭`);
    } else {
      console.log(`[WebRTCService.closeConnection] 该friendId不存在DataChannel`);
    }

    // 关闭RTCPeerConnection
    const connection = this.connections.get(friendId);
    if (connection) {
      console.log(`[WebRTCService.closeConnection] 关闭RTCPeerConnection (当前状态: ${connection.connectionState})...`);
      connection.close();
      this.connections.delete(friendId);
      console.log(`[WebRTCService.closeConnection] RTCPeerConnection已关闭`);
    } else {
      console.log(`[WebRTCService.closeConnection] 该friendId不存在连接`);
    }

    // 移除远程媒体流
    const remoteStream = this.remoteStreams.get(friendId);
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStreams.delete(friendId);
      console.log(`[WebRTCService.closeConnection] 远程媒体流已移除`);
    }

    console.log(`[WebRTCService.closeConnection] ✅ 连接已关闭，剩余连接数: ${this.connections.size}`);
  }

  /**
   * 关闭所有连接
   * 用于窗口卸载或应用退出时清理资源
   */
  closeAllConnections(): void {
    console.log(`[WebRTCService.closeAllConnections] 开始关闭所有连接 (当前连接数: ${this.connections.size}, 通道数: ${this.dataChannels.size})...`);

    // 关闭所有数据通道
    this.dataChannels.forEach((channel, friendId) => {
      console.log(`[WebRTCService.closeAllConnections] 关闭 ${friendId} 的DataChannel...`);
      channel.close();
    });
    this.dataChannels.clear();
    console.log(`[WebRTCService.closeAllConnections] 所有DataChannel已关闭`);

    // 关闭所有连接
    this.connections.forEach((connection, friendId) => {
      console.log(`[WebRTCService.closeAllConnections] 关闭 ${friendId} 的RTCPeerConnection...`);
      connection.close();
    });
    this.connections.clear();
    console.log(`[WebRTCService.closeAllConnections] 所有RTCPeerConnection已关闭`);

    // 关闭所有远程媒体流
    this.remoteStreams.forEach((stream, friendId) => {
      console.log(`[WebRTCService.closeAllConnections] 关闭 ${friendId} 的远程媒体流...`);
      stream.getTracks().forEach(track => track.stop());
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
    console.log(`[WebRTCService.getConnectionState] 查询 ${friendId} 的连接状态: ${state}`);
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
    console.log(`[WebRTCService.isDataChannelOpen] 检查 ${friendId} 的DataChannel状态: ${isOpen ? '✅ 打开' : '❌ 关闭'} (readyState: ${channel?.readyState || '不存在'})`);
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
