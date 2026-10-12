/**
 * 移动端 WebRTC 服务类（从 PC 端 webrtcService/WebRTCService.ts 裁剪移植）
 *
 * 裁剪内容：DataChannel(通话内文字 v1 未做)、NAT检测/IceConnector/诊断日志面板。
 * 保留：完整 SDP 模式(候选内嵌，收集最多 8 秒) + 音视频轨管理与前后摄切换。
 */
import { createWebRTCConfig, hasTurnServer } from "./config";
import { genId } from "./signal";

/** 等待 ICE 候选收集完成（PC SdpHelper 同款逻辑） */
const waitForIceGathering = (
  connection: RTCPeerConnection,
  timeout = 8000
): Promise<void> =>
  new Promise((resolve) => {
    if (connection.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      connection.removeEventListener(
        "icegatheringstatechange",
        onGatheringStateChange
      );
      resolve();
    }, timeout);
    const onGatheringStateChange = () => {
      if (connection.iceGatheringState === "complete") {
        clearTimeout(timer);
        connection.removeEventListener(
          "icegatheringstatechange",
          onGatheringStateChange
        );
        resolve();
      }
    };
    connection.addEventListener(
      "icegatheringstatechange",
      onGatheringStateChange
    );
  });

export class WebRTCService {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private localStream: MediaStream | null = null;
  public sessionId: string;
  private onRemoteStreamCallback:
    | ((friendId: string, stream: MediaStream) => void)
    | null = null;
  private onConnectionStateChange:
    | ((friendId: string, state: RTCPeerConnectionState) => void)
    | null = null;
  private isVideoEnabled = true;
  private isAudioEnabled = true;
  private facingMode: "user" | "environment" = "user";

  constructor() {
    this.sessionId = genId();
    console.log(`[WebRTCService] 初始化 - 会话: ${this.sessionId}`);
  }

  setOnRemoteStreamCallback(
    cb: (friendId: string, stream: MediaStream) => void
  ) {
    this.onRemoteStreamCallback = cb;
  }

  setOnConnectionStateChange(
    cb: (friendId: string, state: RTCPeerConnectionState) => void
  ) {
    this.onConnectionStateChange = cb;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(friendId: string): MediaStream | null {
    return this.remoteStreams.get(friendId) || null;
  }

  getVideoEnabled(): boolean {
    return this.isVideoEnabled;
  }

  getAudioEnabled(): boolean {
    return this.isAudioEnabled;
  }

  /** 初始化本地媒体流；失败时抛出由上层降级处理 */
  async initLocalStream(
    video: boolean,
    audio = true,
    facing: "user" | "environment" = this.facingMode
  ): Promise<MediaStream> {
    this.facingMode = facing;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: video
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: facing,
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
    console.log("[WebRTCService.initLocalStream] 本地媒体流就绪");
    return stream;
  }

  /** 切换前后摄像头（重新采集 + replaceTrack，对端无感知） */
  async switchCamera(): Promise<void> {
    if (!this.localStream) return;
    const newFacing = this.facingMode === "user" ? "environment" : "user";
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: newFacing,
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }
    const oldTrack = this.localStream.getVideoTracks()[0];
    this.connections.forEach((conn) => {
      const sender = conn
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) {
        sender
          .replaceTrack(newTrack)
          .catch((e) => console.error("replaceTrack 失败:", e));
      }
    });
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
    this.facingMode = newFacing;
    console.log("[WebRTCService.switchCamera] 摄像头已切换:", newFacing);
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) {
      this.isVideoEnabled = !this.isVideoEnabled;
      track.enabled = this.isVideoEnabled;
    }
    return this.isVideoEnabled;
  }

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) {
      this.isAudioEnabled = !this.isAudioEnabled;
      track.enabled = this.isAudioEnabled;
    }
    return this.isAudioEnabled;
  }

  /** 创建（或复用）到对端的连接并绑定事件/本地轨道 */
  async ensureConnection(friendId: string): Promise<RTCPeerConnection> {
    const existing = this.connections.get(friendId);
    if (existing) return existing;

    const connection = new RTCPeerConnection(createWebRTCConfig());
    this.connections.set(friendId, connection);

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      console.log(
        `[WebRTCService] ${friendId} 连接状态: ${state} (ICE: ${connection.iceConnectionState})`
      );
      this.onConnectionStateChange?.(friendId, state);
    };

    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === "failed") {
        console.error(
          `[WebRTCService] ${friendId} ICE 连接失败` +
            (hasTurnServer()
              ? ""
              : "（未配置 TURN，对称 NAT 下可能无法建立连接）")
        );
      }
    };

    // 完整 SDP 模式：候选内嵌于 SDP，无需逐条发送；ondatachannel 预留（v1 未用）
    connection.onicecandidate = () => {};

    connection.ontrack = (event) => {
      if (event.streams && event.streams.length > 0) {
        const remote = event.streams[0];
        this.remoteStreams.set(friendId, remote);
        console.log(
          `[WebRTCService] 收到 ${friendId} 的远程媒体流: ${remote.getTracks().length} 轨`
        );
        this.onRemoteStreamCallback?.(friendId, remote);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream) connection.addTrack(track, this.localStream);
      });
    }
    return connection;
  }

  /** 发起方：创建 offer（等候选收集完，返回含全部候选的完整 SDP） */
  async createOffer(friendId: string): Promise<RTCSessionDescriptionInit> {
    const connection = await this.ensureConnection(friendId);
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await connection.setLocalDescription(offer);
    await waitForIceGathering(connection, 8000);
    return connection.localDescription ?? offer;
  }

  /** 响应方：处理 offer 并创建 answer */
  async handleOffer(
    friendId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const connection = await this.ensureConnection(friendId);
    if (connection.signalingState !== "stable") {
      console.warn(
        `[WebRTCService] ${friendId} 非 stable(${connection.signalingState})，丢弃 offer`
      );
      return connection.localDescription ?? offer;
    }
    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await waitForIceGathering(connection, 8000);
    return connection.localDescription ?? answer;
  }

  /** 发起方：处理对端 answer */
  async handleAnswer(
    friendId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const connection = this.connections.get(friendId);
    if (!connection) throw new Error("未找到该联系人的连接");
    if (
      connection.connectionState === "closed" ||
      connection.signalingState !== "have-local-offer"
    ) {
      console.warn(
        `[WebRTCService] 跳过 setRemoteDescription (state=${connection.connectionState}, signaling=${connection.signalingState})`
      );
      return;
    }
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /** 处理对端 ICE 候选（完整 SDP 模式下一般用不到，兼容保留） */
  async handleCandidate(
    friendId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const connection = this.connections.get(friendId);
    if (!connection) throw new Error("未找到该联系人的连接");
    const iceCandidate = new RTCIceCandidate(candidate);
    if (iceCandidate.type === "relay" && !hasTurnServer()) return;
    await connection.addIceCandidate(iceCandidate);
  }

  /** 通过 invoke('send_webrtc_signal') 发送信令 */

  getConnection(friendId: string): RTCPeerConnection | undefined {
    return this.connections.get(friendId);
  }

  getConnectionState(friendId: string): RTCPeerConnectionState | null {
    return this.connections.get(friendId)?.connectionState || null;
  }

  closeConnection(friendId: string): void {
    const connection = this.connections.get(friendId);
    if (connection) {
      connection.close();
      this.connections.delete(friendId);
    }
    const remote = this.remoteStreams.get(friendId);
    if (remote) {
      remote.getTracks().forEach((t) => t.stop());
      this.remoteStreams.delete(friendId);
    }
    console.log(`[WebRTCService] 已关闭 ${friendId} 的连接`);
  }

  closeLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  closeAllConnections(): void {
    this.connections.forEach((_conn, friendId) =>
      this.closeConnection(friendId)
    );
    this.closeLocalStream();
  }
}
