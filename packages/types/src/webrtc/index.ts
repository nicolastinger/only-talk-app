/**
 * WebRTC 信令消息接口
 * 用于在两个对等端之间交换会话描述和ICE候选信息
 */
interface WebRTCSignalMessage {
  /** 信令类型: offer(发起方的媒体描述) | answer(响应方的媒体描述) | candidate(ICE候选地址) */
  type: 'offer' | 'answer' | 'candidate';
  /** 发送方用户ID */
  sender: string;
  /** 接收方用户ID */
  receiver: string;
  /** 当前会话ID，用于关联一次完整的P2P连接 */
  sessionId: string;
  /** 信令数据: offer/answer时为RTCSessionDescriptionInit, candidate时为RTCIceCandidateInit */
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  /** 消息发送时间戳 */
  timestamp: number;
}

/**
 * WebRTC 会话接口
 * 代表一次完整的P2P连接会话，包含连接和数据通道的状态
 */
interface WebRTCSession {
  /** 会话唯一标识符 */
  sessionId: string;
  /** 对端用户ID(聊天对象) */
  friendId: string;
  /** RTCPeerConnection 连接对象，负责建立P2P连接 */
  connection: RTCPeerConnection | null;
  /** RTCDataChannel 数据通道，用于收发聊天消息 */
  dataChannel: RTCDataChannel | null;
  /** 是否为发起方: true=本端发起offer, false=本端响应offer */
  isInitiator: boolean;
  /** 连接状态: connecting(连接中) | connected(已连接) | disconnected(已断开) | failed(连接失败) */
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

/**
 * WebRTC 配置接口
 * RTCPeerConnection的配置参数
 */
interface WebRTCConfig {
  /** ICE服务器列表(STUN/TURN服务器) */
  iceServers: RTCIceServer[];
  /** ICE传输策略: 'all'=使用所有候选 | 'relay'=仅使用中继候选(relay servers) */
  iceTransportPolicy: RTCIceTransportPolicy;
  /** 媒体束策略: 'max-bundle'=将所有媒体复用到单个传输 | 'balanced'平衡策略 */
  bundlePolicy: RTCBundlePolicy;
}

/**
 * WebRTC 消息接口
 * DataChannel中传输的实际消息内容
 */
interface WebRTCMessage {
  /** 消息类型: text(文本消息) | file(文件消息) | control(控制消息) */
  type: 'text' | 'file' | 'control';
  /** 消息内容(文本、文件数据或控制命令) */
  content: string;
  /** 消息生成时间戳 */
  timestamp: number;
  /** 消息发送者的用户ID */
  sender: string;
}

export type {
  WebRTCSignalMessage,
  WebRTCSession,
  WebRTCConfig,
  WebRTCMessage,
};
