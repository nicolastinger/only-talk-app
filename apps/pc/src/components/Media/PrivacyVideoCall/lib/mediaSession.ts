/**
 * MediaSession：集中承载 PrivacyVideoCall 全部可变媒体/编解码状态槽位。
 *
 * 取代组件内分散的几十个 useRef，让 codec 模块能以 `(session, ...)` 方式
 * 读写这些状态，实现编解码逻辑与 React 组件解耦。
 */
import {
  createThroughputCounter,
  ThroughputCounter,
} from '../media/mediaStats';

export interface MediaSession {
  // 录制器 / 本地媒体流
  mediaRecorder: MediaRecorder | null;
  audioRecorder: MediaRecorder | null;
  localStream: MediaStream | null;
  isMediaSending: boolean;
  mediaSendDelayTimer: NodeJS.Timeout | null;

  // 视频编码（WebCodecs）
  videoEncoder: VideoEncoder | null;
  videoTrackProcessor: MediaStreamTrackProcessorLike | null;
  videoReader: ReadableStreamDefaultReader<VideoFrame> | null;
  keyframeTimer: NodeJS.Timeout | null;
  requestKeyframe: boolean;

  // 视频解码
  videoDecoder: VideoDecoder | null;
  videoCanvas: HTMLCanvasElement | null;
  videoCanvasCtx: CanvasRenderingContext2D | null;
  remoteCanvasStream: MediaStream | null;
  lastSentVideoConfig: VideoDecoderConfig | null;
  decodedVideoConfig: VideoDecoderConfig | null;
  pendingVideoFrames: EncodedVideoChunk[];
  videoFirstKeyframeReceived: boolean;
  lastRecoverySignal: number;

  // 音频编码（WebCodecs）
  audioEncoder: AudioEncoder | null;
  audioTrackProcessor: AudioStreamTrackProcessorLike | null;
  audioReader: ReadableStreamDefaultReader<AudioData> | null;

  // 音频解码
  audioDecoder: AudioDecoder | null;
  audioContext: AudioContext | null;
  decodedAudioConfig: AudioDecoderConfig | null;
  lastSentAudioConfig: AudioDecoderConfig | null;
  audioPlayTime: number;
  audioWebCodecsActive: boolean;

  // 吞吐计数（诊断）
  throughput: ThroughputCounter;

  // MediaSource 回退接收
  mediaSource: MediaSource | null;
  sourceBuffer: SourceBuffer | null;
  audioMediaSource: MediaSource | null;
  audioSourceBuffer: SourceBuffer | null;
  videoBufferQueue: Uint8Array[];
  audioBufferQueue: Uint8Array[];
  isVideoSourceBufferUpdating: boolean;
  isAudioSourceBufferUpdating: boolean;

  // 媒体信息通道
  mediaInfoStats: {
    frameRate: number;
    videoBitrate: number;
    audioBitrate: number;
    latency: number;
    droppedFrames: number;
  };
  mediaStartTime: number;
  mediaInfoInterval: NodeJS.Timeout | null;
}

export const createMediaSession = (): MediaSession => ({
  mediaRecorder: null,
  audioRecorder: null,
  localStream: null,
  isMediaSending: false,
  mediaSendDelayTimer: null,

  videoEncoder: null,
  videoTrackProcessor: null,
  videoReader: null,
  keyframeTimer: null,
  requestKeyframe: false,

  videoDecoder: null,
  videoCanvas: null,
  videoCanvasCtx: null,
  remoteCanvasStream: null,
  lastSentVideoConfig: null,
  decodedVideoConfig: null,
  pendingVideoFrames: [],
  videoFirstKeyframeReceived: false,
  lastRecoverySignal: 0,

  audioEncoder: null,
  audioTrackProcessor: null,
  audioReader: null,

  audioDecoder: null,
  audioContext: null,
  decodedAudioConfig: null,
  lastSentAudioConfig: null,
  audioPlayTime: 0,
  audioWebCodecsActive: false,

  throughput: createThroughputCounter(),

  mediaSource: null,
  sourceBuffer: null,
  audioMediaSource: null,
  audioSourceBuffer: null,
  videoBufferQueue: [],
  audioBufferQueue: [],
  isVideoSourceBufferUpdating: false,
  isAudioSourceBufferUpdating: false,

  mediaInfoStats: {
    frameRate: 0,
    videoBitrate: 0,
    audioBitrate: 0,
    latency: 0,
    droppedFrames: 0,
  },
  mediaStartTime: 0,
  mediaInfoInterval: null,
});
