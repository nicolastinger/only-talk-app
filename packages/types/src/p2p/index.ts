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
 * 媒体控制类型枚举
 */
type MediaControlType = 
  | 'VideoToggle'   // 视频开关
  | 'AudioToggle'   // 音频开关
  | 'Pause'         // 暂停
  | 'Resume'        // 恢复
  | 'EndCall';      // 结束通话

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

export { 
  VideoConfig, 
  AudioConfig, 
  BufferConfig, 
  MediaConfig, 
  MediaControlType, 
  MediaControl,
  MediaControlState 
};
