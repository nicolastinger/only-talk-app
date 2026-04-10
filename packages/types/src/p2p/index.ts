/**
 * 视频配置接口
 * 用于视频通话参数设置
 */
interface VideoConfig {
  /** 视频宽度 (像素) */
  width: number;
  /** 视频高度 (像素) */
  height: number;
  /** 帧率 (fps) */
  fps: number;
  /** 是否开启音频 */
  audio: boolean;
  /** 是否开启视频 */
  video: boolean;
  /** 视频编码方式 (如: "video/webm;codecs=vp8") */
  encode: string;
  /** 视频码率 (bps) */
  bitrate: number;
}

/**
 * 音频配置接口
 * 用于音频参数设置
 */
interface AudioConfig {
  /** 采样率 (Hz) - 如: 48000 */
  sample_rate: number;
  /** 声道数 - 1:单声道, 2:立体声 */
  channels: number;
  /** 音频编码方式 (如: "audio/opus") */
  encode: string;
  /** 音频码率 (bps) */
  bitrate: number;
  /** 是否开启回声消除 */
  echo_cancellation: boolean;
  /** 是否开启噪声抑制 */
  noise_suppression: boolean;
  /** 是否开启自动增益控制 */
  auto_gain_control: boolean;
}

/**
 * 缓冲配置接口
 * 用于控制媒体流的缓冲策略
 */
interface BufferConfig {
  /** 视频缓冲大小 (帧数) */
  video_buffer_size: number;
  /** 音频缓冲大小 (帧数) */
  audio_buffer_size: number;
  /** 是否启用自适应缓冲 */
  adaptive_buffer: boolean;
  /** 最大延迟 (毫秒) */
  max_latency_ms: number;
}

/**
 * 媒体配置接口
 * 统一的视频和音频配置
 */
interface MediaConfig {
  /** 视频配置 */
  video_config: VideoConfig;
  /** 音频配置 */
  audio_config: AudioConfig;
  /** 缓冲配置 */
  buffer_config: BufferConfig;
}

/**
 * P2P通道类型枚举
 * 用于区分不同的P2P数据通道
 * 每个通道类型对应QUIC上的一个独立双向流
 */
type P2pChannelType =
  | "Default" // 默认通道 - 用于信令、文本消息、控制命令等
  | "MediaInfo" // 媒体信息通道 - 用于传输媒体状态信息、分辨率变化、码率调整等控制信令
  | "MediaData" // 媒体数据通道 - 用于视频帧和音频帧传输
  | "File"; // 文件传输通道 - 用于文件分片数据和文件传输握手

/**
 * 媒体信息类型枚举
 */
type MediaInfoType =
  | "ResolutionChange" // 分辨率变化通知
  | "BitrateChange" // 码率调整通知
  | "FrameRateStats" // 帧率统计信息
  | "NetworkQuality" // 网络质量信息
  | "EncoderInfo" // 编码器信息
  | { Custom: string }; // 自定义媒体信息

/**
 * 媒体信息接口
 * 用于隐私模式视频聊天的媒体信息通道
 * 传输实时媒体状态信息，如分辨率变化、码率调整、帧率统计等
 */
interface MediaInfo {
  /** 媒体信息类型 */
  info_type: MediaInfoType;
  /** 信息数据 (JSON序列化) */
  data: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 媒体控制类型枚举
 */
type MediaControlType =
  | "VideoToggle" // 视频开关
  | "AudioToggle" // 音频开关
  | "Pause" // 暂停
  | "Resume" // 恢复
  | "EndCall"; // 结束通话

/**
 * 媒体控制命令接口
 */
interface MediaControl {
  /** 控制类型 */
  control_type: MediaControlType;
  /** 是否启用 */
  enabled: boolean;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 媒体控制状态接口
 * 用于跟踪当前的媒体状态
 */
interface MediaControlState {
  /** 视频是否开启 */
  videoEnabled: boolean;
  /** 音频是否开启 */
  audioEnabled: boolean;
  /** 是否暂停 */
  isPaused: boolean;
  /** 是否正在通话 */
  isInCall: boolean;
}

/**
 * 视频通话邀请接口
 * 当一方发起视频通话时发送此消息
 */
interface VideoCallInvite {
  /** 邀请者UUID (发送方) */
  from_uuid: string;
  /** 被邀请者UUID (接收方) */
  to_uuid: string;
  /** 邀请时间戳 */
  timestamp: number;
  /** 邀请者的媒体配置 (可选，用于提前协商) */
  media_config?: MediaConfig;
  /** 邀请者的昵称/用户名 (用于显示) */
  from_name?: string;
}

/**
 * 视频通话响应接口
 * 当接收方接受或拒绝视频通话时发送
 */
interface VideoCallResponse {
  /** 响应者UUID */
  from_uuid: string;
  /** 邀请者UUID */
  to_uuid: string;
  /** 是否接受邀请 */
  accept: boolean;
  /** 响应时间戳 */
  timestamp: number;
  /** 响应者的媒体配置 (接受时携带) */
  media_config?: MediaConfig;
  /** 拒绝原因 (拒绝时可选) */
  reject_reason?: string;
}

/**
 * 视频通话状态枚举
 * 用于跟踪视频通话的生命周期状态
 */
type VideoCallState =
  | "Idle" // 空闲状态 - 无通话
  | "Inviting" // 正在邀请 - 等待对方响应
  | "Invited" // 被邀请 - 收到邀请，等待用户操作
  | "InCall" // 通话中 - 双方已建立连接
  | "Ended"; // 已结束 - 通话结束

/**
 * 文件数据接口
 * 用于P2P文件传输中的单个分片
 */
interface FileData {
  /** 文件唯一标识 */
  uuid: string;
  /** 文件名 */
  file_name: string;
  /** MIME类型 (如: "image/png", "application/pdf") */
  mime_type: string;
  /** 文件总大小 (字节) */
  total_size: number;
  /** 当前分片索引 (从0开始) */
  chunk_index: number;
  /** 总分片数 */
  total_chunks: number;
  /** 分片数据 (Base64编码) */
  chunk_data: string;
  /** 传输ID - 用于关联同一次文件传输的所有分片 */
  transfer_id: string;
}

/**
 * 文件传输请求接口
 * 在发送文件数据前，先发送请求等待对方确认
 */
interface FileTransferRequest {
  /** 传输ID - 唯一标识一次文件传输 */
  transfer_id: string;
  /** 文件名 */
  file_name: string;
  /** 文件总大小 (字节) */
  total_size: number;
  /** MIME类型 */
  mime_type: string;
  /** 分片大小 (字节) */
  chunk_size: number;
  /** 总分片数 */
  total_chunks: number;
  /** 请求者UUID */
  from_uuid: string;
  /** 目标UUID */
  to_uuid: string;
  /** 请求时间戳 */
  timestamp: number;
}

/**
 * 文件传输响应接口
 * 对方收到文件传输请求后的回复
 */
interface FileTransferResponse {
  /** 传输ID - 对应请求中的transfer_id */
  transfer_id: string;
  /** 是否接受传输 */
  accept: boolean;
  /** 响应者UUID */
  from_uuid: string;
  /** 目标UUID */
  to_uuid: string;
  /** 拒绝原因 (拒绝时可选) */
  reject_reason?: string;
  /** 响应时间戳 */
  timestamp: number;
}

export {
  P2pChannelType,
  MediaInfoType,
  MediaInfo,
  VideoConfig,
  AudioConfig,
  BufferConfig,
  MediaConfig,
  MediaControlType,
  MediaControl,
  MediaControlState,
  VideoCallInvite,
  VideoCallResponse,
  VideoCallState,
  FileData,
  FileTransferRequest,
  FileTransferResponse,
};
