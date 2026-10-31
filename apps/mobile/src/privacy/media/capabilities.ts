/**
 * 移动端隐私模式音视频能力检测。
 *
 * 隐私模式音视频使用与 PC 相同的 WebCodecs 裸帧协议（H264/VP8 + Opus），
 * 依赖 MediaStreamTrackProcessor 读取轨道帧。任一能力缺失时**不提供音视频通话**，
 * 隐私模式仍可正常进行文字聊天。
 */
export interface PrivacyMediaCapabilities {
  supported: boolean;
  /** 不支持时的原因（仅用于日志/排查） */
  reason: string;
  /** 可用的视频编码 codec（支持时） */
  videoCodec: string;
}

const WIDTH = 640;
const HEIGHT = 480;
const FPS = 15;
const BITRATE = 500000;
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 1;
const AUDIO_BITRATE = 32000;

const VIDEO_ENCODE_CANDIDATES = ["avc1.42E01E", "avc1.640028", "vp8"];

const unsupported = (reason: string): PrivacyMediaCapabilities => ({
  supported: false,
  reason,
  videoCodec: "",
});

const hasGlobal = (name: string): boolean =>
  typeof (globalThis as Record<string, unknown>)[name] !== "undefined";

/**
 * 检测本机 WebView 是否具备隐私音视频能力。
 * 该函数只做能力探测，不申请摄像头/麦克风权限。
 */
export async function detectPrivacyMediaCapabilities(): Promise<PrivacyMediaCapabilities> {
  if (typeof window === "undefined") return unsupported("no-window");

  for (const name of [
    "VideoEncoder",
    "VideoDecoder",
    "AudioEncoder",
    "AudioDecoder",
    "VideoFrame",
    "EncodedVideoChunk",
    "AudioData",
    "EncodedAudioChunk",
    "AudioContext",
  ]) {
    if (!hasGlobal(name)) return unsupported(`missing-${name}`);
  }

  // 编码端需要从 MediaStreamTrack 读取 VideoFrame/AudioData
  if (!hasGlobal("MediaStreamTrackProcessor")) {
    return unsupported("missing-MediaStreamTrackProcessor");
  }

  // 解码端把画面画到 canvas 再 captureStream 给 <video>
  if (
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return unsupported("missing-canvas-captureStream");
  }

  // 音频：Opus 编解码（与 PC 保持一致）
  try {
    const encode = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: AUDIO_CHANNELS,
      bitrate: AUDIO_BITRATE,
    });
    if (!encode.supported) return unsupported("opus-encode-unsupported");

    const decode = await AudioDecoder.isConfigSupported({
      codec: "opus",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: AUDIO_CHANNELS,
    });
    if (!decode.supported) return unsupported("opus-decode-unsupported");
  } catch (e) {
    return unsupported(`audio-check-failed: ${String(e)}`);
  }

  // 视频：至少一种编码可用（PC 解码端同时支持 H264/VP8）
  let videoCodec = "";
  for (const codec of VIDEO_ENCODE_CANDIDATES) {
    for (const hardwareAcceleration of [
      "prefer-hardware",
      "no-preference",
    ] as HardwareAcceleration[]) {
      try {
        const result = await VideoEncoder.isConfigSupported({
          codec,
          width: WIDTH,
          height: HEIGHT,
          bitrate: BITRATE,
          framerate: FPS,
          hardwareAcceleration,
          latencyMode: "realtime",
        });
        if (result.supported) {
          videoCodec = codec;
          break;
        }
      } catch {
        // 尝试下一个配置
      }
    }
    if (videoCodec) break;
  }
  if (!videoCodec) return unsupported("no-video-encoder");

  // PC 优先使用 H264，因此必须能解码 H264，否则不开启视频通话
  try {
    const decode = await VideoDecoder.isConfigSupported({
      codec: "avc1.42E01E",
      codedWidth: WIDTH,
      codedHeight: HEIGHT,
      optimizeForLatency: true,
    });
    if (!decode.supported) return unsupported("h264-decode-unsupported");
  } catch (e) {
    return unsupported(`video-decode-check-failed: ${String(e)}`);
  }

  return { supported: true, reason: "", videoCodec };
}
