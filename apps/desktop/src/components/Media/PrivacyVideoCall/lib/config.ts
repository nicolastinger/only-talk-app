/**
 * PrivacyVideoCall 静态配置与通用工具
 *
 * 纯常量/纯函数，不依赖 React 组件状态。
 */
import { MediaConfig } from '@workspace/types';

/**
 * MediaData 通道内的自定义帧头（24 字节，均大端序）：
 * - [0-7]   timestamp (u64, 微秒)
 * - [8-15]  duration  (u64, 微秒)
 * - [16-19] dataLen   (u32, 数据长度)
 * - [20-23] flags     (u32, bit0=关键帧, bit1=该帧为解码器配置帧)
 */
export const FRAME_HEADER_SIZE = 24;

/** 周期关键帧间隔（毫秒），用于接收端断流恢复 */
export const KEYFRAME_INTERVAL_MS = 2000;

/** 是否启用 WebCodecs 低延迟编码管线（H264/VP8 裸帧，无 WebM 容器） */
export const IS_WEBCODECS_SUPPORTED =
  typeof VideoEncoder !== 'undefined' &&
  typeof VideoDecoder !== 'undefined' &&
  typeof MediaStreamTrackProcessor !== 'undefined';

/**
 * 默认媒体配置
 * - 视频分辨率: 640x480
 * - 帧率: 15fps
 * - 视频编码: WebCodecs（H264 硬件优先 / VP8 软编兜底），回退 MediaRecorder 时使用 VP8
 * - 码率: 500kbps
 * - 音频采样率: 48kHz
 * - 音频编码: Opus
 */
export const defaultMediaConfig: MediaConfig = {
  video_config: {
    width: 640,
    height: 480,
    fps: 15,
    audio: true,
    video: true,
    encode: 'video/webm;codecs=vp8',
    bitrate: 500000,
  },
  audio_config: {
    sample_rate: 48000,
    channels: 1,
    encode: 'audio/webm;codecs=opus',
    bitrate: 32000,
    echo_cancellation: true,
    noise_suppression: true,
    auto_gain_control: true,
  },
  buffer_config: {
    video_buffer_size: 5,
    audio_buffer_size: 10,
    adaptive_buffer: true,
    max_latency_ms: 200,
  },
};

/** 将 ArrayBuffer/视图序列化为 number[]，用于跨 Tauri IPC 传输 */
export const toNumberArray = (
  src: AllowSharedBufferSource | undefined,
): number[] => {
  if (!src) return [];
  if (src instanceof ArrayBuffer) return Array.from(new Uint8Array(src));
  if (src instanceof SharedArrayBuffer) return Array.from(new Uint8Array(src));
  if (ArrayBuffer.isView(src)) {
    return Array.from(
      new Uint8Array(src.buffer, src.byteOffset, src.byteLength),
    );
  }
  return [];
};

/**
 * 诊断日志工具：统一为 PrivacyVideoCall 输出带时间戳的日志，便于定位视频通话失败原因。
 * 用法：dlog('[VideoCall] 阶段', 关键参数)
 */
export const dlog = (...args: unknown[]) => {
  const ts = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [PrivacyVideoCall]`, ...args);
};
