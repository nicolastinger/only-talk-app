/**
 * 隐私视频通话组件
 *
 * 功能说明：
 * 1. 发起视频通话邀请
 * 2. 接收和显示远程视频/音频
 * 3. 发送本地视频/音频数据
 * 4. 控制视频/音频的开关
 * 5. 处理通话结束
 *
 * 使用方式：
 * <PrivacyVideoCall
 *   friendId="对方UUID"
 *   isInitiator={true} // 是否为发起方
 *   onClose={() => {}} // 通话结束回调
 * />
 */
import {
  AudioMutedOutlined,
  AudioOutlined,
  LogoutOutlined,
  PhoneOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  MediaConfig,
  MediaControl,
  MediaControlState,
  MediaInfo,
  VideoCallInvite,
} from '@workspace/types';
import { Button, message, Spin, Tooltip } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './index.module.less';

// ==================== 组件属性接口 ====================

interface PrivacyVideoCallProps {
  /** 对方用户UUID */
  friendId: string;
  /** 是否为发起方 (主动发起视频通话) */
  isInitiator?: boolean;
  /** 通话结束回调函数 */
  onClose?: () => void;
  /** 邀请信息 (被邀请方接收到的) */
  inviteInfo?: VideoCallInvite | null;
}

// ==================== WebCodecs 常量与能力检测 ====================

/**
 * MediaData 通道内的自定义帧头（20 字节，均大端序）：
 * - [0-7]   timestamp (u64, 微秒)
 * - [8-15]  duration  (u64, 微秒)
 * - [16-19] dataLen   (u32, 数据长度)
 * - [20-23] flags     (u32, bit0=关键帧, bit1=该帧为解码器配置帧)
 */
const FRAME_HEADER_SIZE = 24;

/** 周期关键帧间隔（毫秒），用于接收端断流恢复 */
const KEYFRAME_INTERVAL_MS = 2000;

interface MediaStreamTrackProcessorLike {
  readonly readable: ReadableStream<VideoFrame>;
}

interface AudioStreamTrackProcessorLike {
  readonly readable: ReadableStream<AudioData>;
}

/** TS 5.9 的 lib.dom 尚未收录 MediaStreamTrackProcessor，这里补充声明 */
declare const MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessorLike;
  new (init: { track: MediaStreamTrack }): MediaStreamTrackProcessorLike;
};

/** 是否启用 WebCodecs 低延迟编码管线（H264/VP8 裸帧，无 WebM 容器） */
const IS_WEBCODECS_SUPPORTED =
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
const defaultMediaConfig: MediaConfig = {
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
const toNumberArray = (src: AllowSharedBufferSource | undefined): number[] => {
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
const dlog = (...args: unknown[]) => {
  const ts = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [PrivacyVideoCall]`, ...args);
};

/** 编码/解码帧吞吐计数器，用于诊断是否持续在收发数据 */
interface ThroughputCounter {
  sentFrames: number;
  sentBytes: number;
  receivedFrames: number;
  receivedBytes: number;
  receivedKeyFrames: number;
  lastReportAt: number;
}

// ==================== 主组件 ====================

const PrivacyVideoCall: React.FC<PrivacyVideoCallProps> = ({
  friendId,
  isInitiator = false,
  onClose,
  inviteInfo,
}) => {
  // ==================== 视频元素引用 ====================

  /** 本地视频元素引用 - 用于显示本地摄像头画面 */
  const localVideoRef = useRef<HTMLVideoElement>(null);

  /** 远程视频元素引用 - 用于显示对方视频画面 */
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  /** 本地音频元素引用 - 用于播放本地音频(通常静音) */
  const localAudioRef = useRef<HTMLAudioElement>(null);

  /** 远程音频元素引用 - 用于播放对方音频 */
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // ==================== 媒体录制器引用 ====================

  /** 视频录制器 - 录制本地摄像头视频 */
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  /** 音频录制器 - 录制本地麦克风音频 */
  const audioRecorderRef = useRef<MediaRecorder | null>(null);

  /** 本地媒体流 - 包含视频和音频轨道 */
  const localStreamRef = useRef<MediaStream | null>(null);

  // ==================== WebCodecs 编码器/解码器引用 ====================

  /** 视频编码器 - WebCodecs 实时编码（H264/VP8 裸帧） */
  const videoEncoderRef = useRef<VideoEncoder | null>(null);

  /** 视频轨道处理器 - 从摄像头轨道读取 VideoFrame */
  const videoTrackProcessorRef = useRef<MediaStreamTrackProcessorLike | null>(
    null,
  );

  /** 远程视频解码器 - 解码对方发来的裸编码帧 */
  const videoDecoderRef = useRef<VideoDecoder | null>(null);

  /** 远程视频渲染画布 - 将解码出的 VideoFrame 绘制到画布并捕获为流 */
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  /** 远程视频画布 2D 上下文 */
  const videoCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  /** 远程视频画布捕获流 - 通过 captureStream 喂给远程 video 元素 */
  const remoteCanvasStreamRef = useRef<MediaStream | null>(null);

  /** 已发送给对方的视频解码器配置 */
  const lastSentVideoConfigRef = useRef<VideoDecoderConfig | null>(null);

  /** 当前生效的视频解码器配置 */
  const decodedVideoConfigRef = useRef<VideoDecoderConfig | null>(null);

  /** 请求关键帧标记 - 置为 true 时下一帧编码为关键帧 */
  const requestKeyframeRef = useRef<boolean>(false);

  /** 周期关键帧定时器 */
  const keyframeTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** 媒体发送是否已启动 - 防止 initLocalMedia 与 media_receiver_ready 双重启动 */
  const isMediaSendingRef = useRef<boolean>(false);

  /** 媒体发送延迟启动定时器 - 建立通话后延迟 1s 再开始采集发送，保证对端接收器先就绪 */
  const mediaSendDelayTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** 待解码视频数据帧缓冲 - 解码器配置完成前暂存，配置好后按序刷新 */
  const pendingVideoFramesRef = useRef<EncodedVideoChunk[]>([]);

  /** 视频数据帧是否已开始正常流转（首次收到关键帧后置 true，用于诊断） */
  const videoFirstKeyframeReceivedRef = useRef<boolean>(false);

  // ==================== WebCodecs 音频编码器/解码器引用 ====================

  /** 音频编码器 - WebCodecs Opus 实时编码 */
  const audioEncoderRef = useRef<AudioEncoder | null>(null);

  /** 音频轨道处理器 - 从麦克风轨道读取 AudioData */
  const audioTrackProcessorRef = useRef<AudioStreamTrackProcessorLike | null>(
    null,
  );

  /** 远程音频解码器 - 解码对方发来的裸 Opus 帧 */
  const audioDecoderRef = useRef<AudioDecoder | null>(null);

  /** 音频解码目标 AudioContext - 用于播放远程音频 */
  const audioContextRef = useRef<AudioContext | null>(null);

  /** 远程音频当前生效的解码器配置 */
  const decodedAudioConfigRef = useRef<AudioDecoderConfig | null>(null);

  /** 已发送给对方的音频解码器配置 */
  const lastSentAudioConfigRef = useRef<AudioDecoderConfig | null>(null);

  /** 音频渲染播放时钟 - 追踪下一个可调度时间点 */
  const audioPlayTimeRef = useRef<number>(0);

  /** 是否已通过 WebCodecs 处理音频（决定接收端走 WebCodecs 还是 MediaSource） */
  const audioWebCodecsActiveRef = useRef<boolean>(false);

  /** 编码/解码吞吐计数器（诊断用） */
  const throughputRef = useRef<ThroughputCounter>({
    sentFrames: 0,
    sentBytes: 0,
    receivedFrames: 0,
    receivedBytes: 0,
    receivedKeyFrames: 0,
    lastReportAt: Date.now(),
  });

  /** 视频轨道读取器 - 用于停止时正确释放锁 */
  const videoReaderRef = useRef<ReadableStreamDefaultReader<VideoFrame> | null>(
    null,
  );

  /** 音频轨道读取器 - 用于停止时正确释放锁 */
  const audioReaderRef = useRef<ReadableStreamDefaultReader<AudioData> | null>(
    null,
  );

  // ==================== 远程媒体接收引用 ====================

  /** MediaSource - 用于接收远程视频流 */
  const mediaSourceRef = useRef<MediaSource | null>(null);

  /** SourceBuffer - 用于缓冲远程视频数据 */
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  /** AudioMediaSource - 用于接收远程音频流 */
  const audioMediaSourceRef = useRef<MediaSource | null>(null);

  /** AudioSourceBuffer - 用于缓冲远程音频数据 */
  const audioSourceBufferRef = useRef<SourceBuffer | null>(null);

  // ==================== 缓冲队列引用 ====================

  /** 视频缓冲队列 - 存储待处理的视频帧 */
  const videoBufferQueueRef = useRef<Uint8Array[]>([]);

  /** 音频缓冲队列 - 存储待处理的音频帧 */
  const audioBufferQueueRef = useRef<Uint8Array[]>([]);

  /** 视频SourceBuffer更新状态标记 - 防止并发写入 */
  const isVideoSourceBufferUpdatingRef = useRef<boolean>(false);

  /** 音频SourceBuffer更新状态标记 - 防止并发写入 */
  const isAudioSourceBufferUpdatingRef = useRef<boolean>(false);

  // ==================== 事件监听器清理引用 ====================

  /** 存储所有事件监听器的取消函数，用于组件卸载时清理 */
  const unlistenRef = useRef<(() => void)[]>([]);

  // ==================== 媒体信息通道引用 ====================

  /** 媒体信息统计 - 用于跟踪和发送媒体状态 */
  const mediaInfoStatsRef = useRef<{
    /** 视频帧率 */
    frameRate: number;
    /** 视频码率 (bps) */
    videoBitrate: number;
    /** 音频码率 (bps) */
    audioBitrate: number;
    /** 网络延迟 (ms) */
    latency: number;
    /** 丢帧数 */
    droppedFrames: number;
  }>({
    frameRate: 0,
    videoBitrate: 0,
    audioBitrate: 0,
    latency: 0,
    droppedFrames: 0,
  });

  /** 媒体发送启动时间（诊断用） */
  const mediaStartTimeRef = useRef<number>(0);

  /** 媒体信息发送定时器 */
  const mediaInfoIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== 组件状态 ====================

  /** 加载状态 - 显示加载动画 */
  const [isLoading, setIsLoading] = useState(true);

  /** 连接状态 - 是否已建立连接 */
  const [isConnected, setIsConnected] = useState(false);

  /** 等待响应状态 - 发起方等待对方接受 */
  const [isWaitingResponse, setIsWaitingResponse] = useState(isInitiator);

  /** 媒体控制状态 - 视频/音频开关状态 */
  const [mediaState, setMediaState] = useState<MediaControlState>({
    videoEnabled: true,
    audioEnabled: true,
    isPaused: false,
    isInCall: false,
  });

  /** 对方媒体接收器是否准备好 - 收到对方的media_ready信号后为true */
  const [isRemoteReceiverReady, setIsRemoteReceiverReady] = useState(false);

  /** 本地媒体接收器是否准备好 - 用于判断是否可以发送media_ready信号 */
  const isLocalReceiverReadyRef = useRef<boolean>(false);

  /** 等待本地接收器就绪的Promise resolve函数 */
  const localReceiverReadyResolveRef = useRef<(() => void) | null>(null);

  /** 重启媒体按钮的状态 */
  const [isRestarting, setIsRestarting] = useState(false);

  /** 跟踪组件是否真正挂载（用于避免 useEffect cleanup 在依赖变化时误触发） */
  const isMountedRef = useRef<boolean>(false);

  /** 跟踪通话是否已结束，防止 handleEndCall 重复执行 */
  const isCallEndedRef = useRef<boolean>(false);

  /** 使用 ref 保存最新的 initLocalMedia，避免事件监听 useEffect 因依赖变化而重新注册 */
  const initLocalMediaRef = useRef<() => void>(() => {});

  /** 使用 ref 保存最新的 startSendingMedia，避免事件监听 useEffect 因依赖变化而重新注册 */
  const startSendingMediaRef = useRef<() => void>(() => {});

  // ==================== 发送媒体就绪信号 ====================

  /**
   * 发送媒体接收就绪信号
   * 通知对方本地已准备好接收媒体数据
   */
  const sendMediaReady = useCallback(async () => {
    try {
      dlog('发送媒体接收就绪信号 ->', friendId);
      await invoke('send_p2p_media_ready', {
        targetUuid: friendId,
      });
      dlog('媒体接收就绪信号已发送');
    } catch (error) {
      console.error('发送媒体就绪信号失败:', error);
    }
  }, [friendId]);

  // ==================== 初始化本地媒体 ====================

  /**
   * 初始化本地媒体设备
   *
   * 流程:
   * 1. 请求摄像头和麦克风权限
   * 2. 配置视频参数 (分辨率、帧率等)
   * 3. 配置音频参数 (采样率、回声消除等)
   * 4. 将媒体流绑定到本地视频元素
   * 5. 发送媒体配置给对方
   * 6. 发送媒体接收就绪信号（重要：在发送媒体数据之前）
   * 7. 等待对方就绪信号后再开始录制并发送媒体数据
   */
  const initLocalMedia = useCallback(async () => {
    try {
      dlog('初始化本地媒体: 请求摄像头/麦克风权限');
      // 请求媒体设备权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: defaultMediaConfig.video_config.width },
          height: { ideal: defaultMediaConfig.video_config.height },
          frameRate: { ideal: defaultMediaConfig.video_config.fps },
          facingMode: 'user', // 前置摄像头
        },
        audio: {
          echoCancellation: defaultMediaConfig.audio_config.echo_cancellation,
          noiseSuppression: defaultMediaConfig.audio_config.noise_suppression,
          autoGainControl: defaultMediaConfig.audio_config.auto_gain_control,
          sampleRate: defaultMediaConfig.audio_config.sample_rate,
          channelCount: defaultMediaConfig.audio_config.channels,
        },
      });
      dlog(
        `获取媒体流成功: 视频轨道=${stream.getVideoTracks().length}, 音频轨道=${
          stream.getAudioTracks().length
        }`,
      );

      // 关键：如果组件已卸载或通话已结束，立即释放媒体流，防止摄像头/麦克风泄漏
      if (!isMountedRef.current || isCallEndedRef.current) {
        console.warn(
          '[PrivacyVideoCall] 组件已卸载或通话已结束，释放刚获取的媒体流',
        );
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // 保存媒体流引用
      localStreamRef.current = stream;

      // 将媒体流绑定到本地视频元素
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 发送媒体配置给对方
      await invoke('send_p2p_media_config', {
        mediaConfig: JSON.stringify(defaultMediaConfig),
        uuid: friendId,
      });
      dlog('媒体配置已发送');

      // 更新状态
      setIsConnected(true);
      setMediaState((prev) => ({ ...prev, isInCall: true }));
      setIsLoading(false);
      setIsWaitingResponse(false);

      // 重要：发送媒体接收就绪信号，通知对方可以开始发送媒体数据
      // 这是解决视频黑屏问题的关键：确保双方都准备好后再开始传输
      await sendMediaReady();

      // 检查对方是否已经准备好，如果是，则开始录制
      if (isRemoteReceiverReady) {
        dlog('对方已准备好，立即开始媒体录制');
        startMediaRecording(stream);
        startMediaInfoReporting();
      } else {
        dlog('等待对方媒体接收器就绪后再开始录制...');
      }
    } catch (error) {
      console.error('初始化本地媒体失败:', error);
      message.error('无法访问摄像头或麦克风');
      setIsLoading(false);
    }
  }, [friendId, isRemoteReceiverReady, sendMediaReady]);

  // 同步 ref，确保事件监听器始终调用最新版本
  initLocalMediaRef.current = initLocalMedia;

  /**
   * 开始发送媒体数据
   * 只有在对方媒体接收器准备好后才能调用
   */
  const startSendingMedia = useCallback(() => {
    if (!localStreamRef.current) return;

    // 建立通话后延迟 1s 再开始采集发送视频/音频数据，
    // 确保对端媒体接收器已充分就绪（接收器注册、解码器配置等），
    // 避免首帧/配置帧在对端未就绪时丢失导致黑屏。
    if (mediaSendDelayTimerRef.current) {
      clearTimeout(mediaSendDelayTimerRef.current);
    }
    mediaSendDelayTimerRef.current = setTimeout(() => {
      console.log('[PrivacyVideoCall] 开始发送媒体数据');
      startMediaRecording(localStreamRef.current!);
      startMediaInfoReporting();
    }, 1000);
  }, []);

  // 同步 ref
  startSendingMediaRef.current = startSendingMedia;

  // ==================== 开始媒体录制 ====================

  /**
   * 开始录制本地媒体数据
   *
   * 流程:
   * 1. 分别获取视频轨道和音频轨道
   * 2. 创建视频录制器和音频录制器
   * 3. 设置数据可用回调，将数据发送给对方
   * 4. 开始录制
   *
   * @param stream - 本地媒体流
   */
  const startMediaRecording = (stream: MediaStream) => {
    // 防止重复启动（initLocalMedia 与 media_receiver_ready 可能都会触发）
    if (isMediaSendingRef.current) {
      dlog('媒体发送已启动，跳过重复启动');
      return;
    }
    isMediaSendingRef.current = true;
    dlog(
      `开始媒体发送: WebCodecs可用=${IS_WEBCODECS_SUPPORTED} 视频轨=${
        stream.getVideoTracks().length > 0
      } 音频轨=${stream.getAudioTracks().length > 0}`,
    );

    // 获取视频轨道
    const videoTrack = stream.getVideoTracks()[0];
    // 获取音频轨道
    const audioTrack = stream.getAudioTracks()[0];

    // 视频：优先使用 WebCodecs 实时编码（裸帧、无 WebM 容器，低延迟）
    // 浏览器不支持 WebCodecs 时回退到 MediaRecorder
    if (videoTrack && IS_WEBCODECS_SUPPORTED) {
      startVideoWebCodecs(stream);
    } else if (videoTrack) {
      dlog('WebCodecs 不可用，视频回退到 MediaRecorder');
      startVideoRecorder(stream);
    } else {
      dlog('无视频轨道，跳过视频发送');
    }

    // 音频：优先使用 WebCodecs Opus 实时编码，不支持时回退到 MediaRecorder
    if (audioTrack && IS_WEBCODECS_SUPPORTED) {
      startAudioWebCodecs(stream);
    } else if (audioTrack) {
      dlog('WebCodecs 不可用，音频回退到 MediaRecorder');
      startAudioRecorder(stream);
    } else {
      dlog('无音频轨道，跳过音频发送');
    }
  };

  // ==================== WebCodecs 音频编码（低延迟管线） ====================

  /** 发送音频解码器配置帧（标志位 bit1），供对端初始化 AudioDecoder */
  const sendAudioDecoderConfig = useCallback(
    async (config: AudioDecoderConfig) => {
      try {
        const json = JSON.stringify({
          codec: config.codec,
          sampleRate: config.sampleRate,
          numberOfChannels: config.numberOfChannels,
          description: toNumberArray(config.description),
        });
        const jsonBytes = new TextEncoder().encode(json);
        const payload = new Uint8Array(FRAME_HEADER_SIZE + jsonBytes.length);
        const view = new DataView(payload.buffer);
        view.setBigUint64(0, BigInt(0), false);
        view.setBigUint64(8, BigInt(0), false);
        view.setUint32(16, jsonBytes.length, false);
        view.setUint32(20, 2, false); // bit1 = 解码器配置帧
        payload.set(jsonBytes, FRAME_HEADER_SIZE);
        console.log(
          '[PrivacyVideoCall] 发送音频解码器配置:',
          config.codec,
          'sampleRate=',
          config.sampleRate,
          'channels=',
          config.numberOfChannels,
          'descBytes=',
          jsonBytes.length,
        );
        await invoke('send_p2p_audio_frame', {
          audioData: Array.from(payload),
          targetUuid: friendId,
        });
      } catch (error) {
        console.error('发送音频解码器配置失败:', error);
      }
    },
    [friendId],
  );

  /** 发送单个音频编码帧（裸 Opus 数据 + 24 字节帧头） */
  const sendEncodedAudioChunk = useCallback(
    async (chunk: EncodedAudioChunk) => {
      try {
        const payload = new Uint8Array(FRAME_HEADER_SIZE + chunk.byteLength);
        const view = new DataView(payload.buffer);
        view.setBigUint64(0, BigInt(chunk.timestamp), false);
        view.setBigUint64(8, BigInt(chunk.duration ?? 0), false);
        view.setUint32(16, chunk.byteLength, false);
        view.setUint32(20, 0, false); // 音频数据帧（Opus 无 I 帧概念）
        chunk.copyTo(payload.subarray(FRAME_HEADER_SIZE));
        await invoke('send_p2p_audio_frame', {
          audioData: Array.from(payload),
          targetUuid: friendId,
        });
      } catch (error) {
        console.error('发送WebCodecs音频帧失败:', error);
      }
    },
    [friendId],
  );

  /** 使用 WebCodecs 实时编码音频（Opus 裸帧，无 WebM 容器） */
  const startAudioWebCodecs = useCallback(
    async (stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      try {
        const sampleRate = defaultMediaConfig.audio_config.sample_rate;
        const channels = defaultMediaConfig.audio_config.channels;

        // Opus 解码器配置：需要描述 sample rate / channel layout
        const audioConfig: AudioEncoderConfig = {
          codec: 'opus',
          sampleRate,
          numberOfChannels: channels,
          bitrate: defaultMediaConfig.audio_config.bitrate,
        };
        const support = await AudioEncoder.isConfigSupported(audioConfig);
        if (!support.supported) {
          throw new Error('Opus 音频编码器配置不支持');
        }

        const encoder = new AudioEncoder({
          output: (chunk, metadata) => {
            const t = throughputRef.current;
            t.sentFrames++;
            t.sentBytes += chunk.byteLength;
            if (Date.now() - t.lastReportAt > 5000) {
              dlog(
                `[发送] 音频帧 5s 内: ${t.sentFrames} 帧, ${(
                  t.sentBytes /
                  1024 /
                  5
                ).toFixed(1)} KB/s, 最近帧 ${chunk.byteLength}B`,
              );
              t.lastReportAt = Date.now();
              t.sentFrames = 0;
              t.sentBytes = 0;
            }
            // 首个 chunk 携带解码器配置，用于对端初始化 AudioDecoder
            if (metadata?.decoderConfig) {
              sendAudioDecoderConfig(metadata.decoderConfig);
              lastSentAudioConfigRef.current = metadata.decoderConfig;
            }
            sendEncodedAudioChunk(chunk);
          },
          error: (err) => {
            console.error('[PrivacyVideoCall] 音频编码器错误:', err);
          },
        });
        encoder.configure(audioConfig);
        audioEncoderRef.current = encoder;
        dlog(
          `音频编码器启动: codec=opus sampleRate=${sampleRate} channels=${channels} bps=${audioConfig.bitrate} 模式=WebCodecs`,
        );

        const processor = new MediaStreamTrackProcessor({ track: audioTrack });
        audioTrackProcessorRef.current =
          processor as unknown as AudioStreamTrackProcessorLike;
        const reader = processor.readable.getReader();
        audioReaderRef.current =
          reader as unknown as ReadableStreamDefaultReader<AudioData>;

        const pump = async () => {
          try {
            while (audioEncoderRef.current) {
              const { value, done } = await reader.read();
              if (done) break;
              const data = value as unknown as AudioData;
              // 背压控制：积压过大时丢弃音频块，避免延迟累积
              const encoderNow = audioEncoderRef.current;
              if (encoderNow && encoderNow.encodeQueueSize > 10) {
                data.close();
                continue;
              }
              encoderNow?.encode(data);
              data.close();
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
              dlog('音频轨道读取已正常停止');
            } else {
              console.error('[PrivacyVideoCall] 音频帧读取失败:', err);
            }
          } finally {
            audioReaderRef.current = null;
            try {
              reader.releaseLock();
            } catch (e) {
              // 忽略释放锁失败
            }
          }
        };
        pump();
      } catch (error) {
        console.error(
          '[PrivacyVideoCall] WebCodecs 音频编码启动失败，音频将不可用:',
          error,
        );
        // 对端已按 WebCodecs 模式初始化，不能回退 MediaRecorder（容器格式不匹配）
      }
    },
    [sendAudioDecoderConfig, sendEncodedAudioChunk],
  );

  /** 使用 MediaRecorder 录制音频（WebCodecs 不可用时的回退方案） */
  const startAudioRecorder = useCallback(
    (stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      const audioStream = new MediaStream([audioTrack]);
      const audioRecorder = new MediaRecorder(audioStream, {
        mimeType: defaultMediaConfig.audio_config.encode,
        audioBitsPerSecond: defaultMediaConfig.audio_config.bitrate,
      });

      audioRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            const buffer = await event.data.arrayBuffer();
            await invoke('send_p2p_audio_frame', {
              audioData: Array.from(new Uint8Array(buffer)),
              targetUuid: friendId,
            });
          } catch (error) {
            console.error('发送音频帧失败:', error);
          }
        }
      };

      audioRecorder.start(20);
      audioRecorderRef.current = audioRecorder;
    },
    [friendId],
  );

  // ==================== WebCodecs 视频编码（低延迟管线） ====================

  /** 发送视频解码器配置帧（标志位 bit1），供对端初始化 VideoDecoder */
  const sendVideoDecoderConfig = useCallback(
    async (config: VideoDecoderConfig) => {
      try {
        const json = JSON.stringify({
          codec: config.codec,
          codedWidth: config.codedWidth,
          codedHeight: config.codedHeight,
          description: toNumberArray(config.description),
          hardwareAcceleration: config.hardwareAcceleration,
          optimizeForLatency: config.optimizeForLatency,
        });
        const jsonBytes = new TextEncoder().encode(json);
        const payload = new Uint8Array(FRAME_HEADER_SIZE + jsonBytes.length);
        const view = new DataView(payload.buffer);
        view.setBigUint64(0, BigInt(0), false);
        view.setBigUint64(8, BigInt(0), false);
        view.setUint32(16, jsonBytes.length, false);
        view.setUint32(20, 2, false); // bit1 = 解码器配置帧
        payload.set(jsonBytes, FRAME_HEADER_SIZE);
        await invoke('send_p2p_video_frame', {
          frameData: Array.from(payload),
          targetUuid: friendId,
        });
        dlog(
          `发送视频解码器配置: codec=${config.codec} descBytes=${jsonBytes.length}`,
        );
      } catch (error) {
        console.error('发送视频解码器配置失败:', error);
        dlog('❌ 发送视频解码器配置失败');
      }
    },
    [friendId],
  );

  /** 发送单个编码帧（裸编码数据 + 20 字节时间戳帧头） */
  const sendEncodedVideoChunk = useCallback(
    async (chunk: EncodedVideoChunk) => {
      try {
        const payload = new Uint8Array(FRAME_HEADER_SIZE + chunk.byteLength);
        const view = new DataView(payload.buffer);
        view.setBigUint64(0, BigInt(chunk.timestamp), false);
        view.setBigUint64(8, BigInt(chunk.duration ?? 0), false);
        view.setUint32(16, chunk.byteLength, false);
        view.setUint32(20, chunk.type === 'key' ? 1 : 0, false);
        chunk.copyTo(payload.subarray(FRAME_HEADER_SIZE));
        await invoke('send_p2p_video_frame', {
          frameData: Array.from(payload),
          targetUuid: friendId,
        });
      } catch (error) {
        console.error('发送WebCodecs视频帧失败:', error);
      }
    },
    [friendId],
  );

  /** 挑选可用的视频编码：优先 H264（硬件加速）→ VP8（软编兜底） */
  const pickVideoCodec = useCallback(async (): Promise<string> => {
    const width = defaultMediaConfig.video_config.width;
    const height = defaultMediaConfig.video_config.height;
    const bitrate = defaultMediaConfig.video_config.bitrate;
    const framerate = defaultMediaConfig.video_config.fps;
    const accelerations: HardwareAcceleration[] = [
      'prefer-hardware',
      'no-preference',
    ];
    for (const codec of ['avc1.42E01E', 'avc1.640028', 'vp8']) {
      for (const hardwareAcceleration of accelerations) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec,
            width,
            height,
            bitrate,
            framerate,
            hardwareAcceleration,
            latencyMode: 'realtime',
          });
          if (support.supported) {
            console.log(
              `[PrivacyVideoCall] 选择视频编码: ${codec} (${hardwareAcceleration})`,
            );
            return codec;
          }
        } catch (error) {
          console.warn(`[PrivacyVideoCall] 检测编码 ${codec} 失败:`, error);
        }
      }
    }
    console.warn('[PrivacyVideoCall] 未找到可用视频编码，默认使用 vp8');
    return 'vp8';
  }, []);

  /** 使用 WebCodecs 实时编码视频帧（裸编码流，无容器） */
  const startVideoWebCodecs = useCallback(
    async (stream: MediaStream) => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      try {
        const codec = await pickVideoCodec();
        const width = defaultMediaConfig.video_config.width;
        const height = defaultMediaConfig.video_config.height;
        const encoderConfig: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate: defaultMediaConfig.video_config.bitrate,
          framerate: defaultMediaConfig.video_config.fps,
          hardwareAcceleration: 'prefer-hardware',
          latencyMode: 'realtime',
        };
        const support = await VideoEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
          encoderConfig.hardwareAcceleration = 'no-preference';
          const fallback = await VideoEncoder.isConfigSupported(encoderConfig);
          if (!fallback.supported) {
            throw new Error(`视频编码器配置不支持: ${codec}`);
          }
        }

        const encoder = new VideoEncoder({
          output: (chunk, metadata) => {
            const t = throughputRef.current;
            t.sentFrames++;
            t.sentBytes += chunk.byteLength;
            // 每 5 秒打印一次发送吞吐
            if (Date.now() - t.lastReportAt > 5000) {
              dlog(
                `[发送] 视频帧 5s 内: ${t.sentFrames} 帧, ${(
                  t.sentBytes /
                  1024 /
                  5
                ).toFixed(1)} KB/s, 最近帧 ${chunk.byteLength}B type=${
                  chunk.type
                }`,
              );
              t.lastReportAt = Date.now();
              t.sentFrames = 0;
              t.sentBytes = 0;
            }
            // 每个关键帧都携带解码器配置（H264 的 SPS/PPS 在此），
            // 保证对端可随时重新初始化解码器并恢复解码。
            // 先发配置帧（await）再发关键帧数据，确保接收端先配置好解码器，避免首帧丢失。
            if (chunk.type === 'key' && metadata?.decoderConfig) {
              sendVideoDecoderConfig(metadata.decoderConfig)
                .then(() => sendEncodedVideoChunk(chunk))
                .catch((e) => {
                  console.error('[PrivacyVideoCall] 发送关键帧失败:', e);
                  sendEncodedVideoChunk(chunk);
                });
              lastSentVideoConfigRef.current = metadata.decoderConfig;
            } else {
              sendEncodedVideoChunk(chunk);
            }
          },
          error: (err) => {
            console.error('[PrivacyVideoCall] 视频编码器错误:', err);
          },
        });
        encoder.configure(encoderConfig);
        videoEncoderRef.current = encoder;
        dlog(
          `视频编码器启动: codec=${codec} ${width}x${height}@${encoderConfig.framerate} bps=${encoderConfig.bitrate} accel=${encoderConfig.hardwareAcceleration} 模式=WebCodecs`,
        );

        // 首个帧强制为关键帧，并带上解码器配置，保证对端能立即开始解码
        requestKeyframeRef.current = true;

        const processor = new MediaStreamTrackProcessor({ track: videoTrack });
        videoTrackProcessorRef.current = processor;
        const reader = processor.readable.getReader();
        videoReaderRef.current = reader;

        const pump = async () => {
          try {
            while (videoEncoderRef.current) {
              const { value, done } = await reader.read();
              if (done) break;
              const frame = value as VideoFrame;
              // 编码背压控制：积压超过 2 帧时丢弃当前帧，避免延迟累积
              const encoderNow = videoEncoderRef.current;
              if (encoderNow && encoderNow.encodeQueueSize > 2) {
                frame.close();
                continue;
              }
              encoderNow?.encode(frame, {
                keyFrame: requestKeyframeRef.current,
              });
              requestKeyframeRef.current = false;
              frame.close();
            }
          } catch (err) {
            // reader.cancel() 会导致挂起的 read() 以 AbortError 结束，属正常停止流程
            if (err instanceof DOMException && err.name === 'AbortError') {
              dlog('视频轨道读取已正常停止');
            } else {
              console.error('[PrivacyVideoCall] 视频帧读取失败:', err);
            }
          } finally {
            videoReaderRef.current = null;
            try {
              reader.releaseLock();
            } catch (e) {
              // 忽略释放锁失败
            }
          }
        };
        pump();

        // 周期关键帧，便于对端解码器断流后恢复
        if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
        keyframeTimerRef.current = setInterval(() => {
          requestKeyframeRef.current = true;
        }, KEYFRAME_INTERVAL_MS);
      } catch (error) {
        console.error(
          '[PrivacyVideoCall] WebCodecs 视频编码启动失败，视频将不可用（音频不受影响）:',
          error,
        );
        dlog('❌ 视频编码启动失败，原因见上方错误');
        // 注意：不能在此回退到 MediaRecorder —— 对端已按 WebCodecs 模式初始化，
        // 切换容器格式会导致画面无法解码。保持音频通道不受影响。
      }
    },
    [pickVideoCodec, sendEncodedVideoChunk, sendVideoDecoderConfig],
  );

  /** 使用 MediaRecorder 录制视频（WebCodecs 不可用时的回退方案） */
  const startVideoRecorder = useCallback(
    (stream: MediaStream) => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      const videoStream = new MediaStream([videoTrack]);
      const videoRecorder = new MediaRecorder(videoStream, {
        mimeType: defaultMediaConfig.video_config.encode,
        videoBitsPerSecond: defaultMediaConfig.video_config.bitrate,
      });

      videoRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            const buffer = await event.data.arrayBuffer();
            await invoke('send_p2p_video_frame', {
              frameData: Array.from(new Uint8Array(buffer)),
              targetUuid: friendId,
            });
          } catch (error) {
            console.error('发送视频帧失败:', error);
          }
        }
      };

      videoRecorder.start(50);
      mediaRecorderRef.current = videoRecorder;
    },
    [friendId],
  );

  // ==================== 初始化远程媒体接收器 ====================

  /**
   * 初始化远程媒体接收器
   *
   * 流程:
   * 1. 创建 MediaSource 对象用于接收视频流
   * 2. 创建 SourceBuffer 用于缓冲视频数据
   * 3. 创建 MediaSource 对象用于接收音频流
   * 4. 创建 SourceBuffer 用于缓冲音频数据
   */
  const initRemoteMediaReceiver = useCallback(async () => {
    dlog(
      `初始化远程媒体接收器: 模式=${
        IS_WEBCODECS_SUPPORTED ? 'WebCodecs' : 'MediaSource(旧)'
      }`,
    );
    if (IS_WEBCODECS_SUPPORTED) {
      // 视频：WebCodecs 解码到画布，再经 captureStream 输出到 video 元素
      if (videoCanvasRef.current) {
        videoCanvasRef.current.width = 0;
        videoCanvasRef.current.height = 0;
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = defaultMediaConfig.video_config.width;
        canvas.height = defaultMediaConfig.video_config.height;
        videoCanvasRef.current = canvas;
      }
      videoCanvasCtxRef.current = videoCanvasRef.current.getContext(
        '2d',
      ) as CanvasRenderingContext2D | null;

      // 重置/重建画布捕获流
      if (remoteCanvasStreamRef.current) {
        remoteCanvasStreamRef.current.getTracks().forEach((t) => t.stop());
        remoteCanvasStreamRef.current = null;
      }
      if (remoteVideoRef.current) {
        const stream = videoCanvasRef.current.captureStream(
          defaultMediaConfig.video_config.fps,
        );
        remoteCanvasStreamRef.current = stream;
        remoteVideoRef.current.srcObject = stream;
      }

      // 重置视频解码器
      if (videoDecoderRef.current) {
        videoDecoderRef.current.close();
        videoDecoderRef.current = null;
      }
      decodedVideoConfigRef.current = null;
      pendingVideoFramesRef.current = [];
      videoFirstKeyframeReceivedRef.current = false;
    } else {
      if (mediaSourceRef.current) {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
        mediaSourceRef.current = null;
      }
      sourceBufferRef.current = null;
      videoBufferQueueRef.current = [];
      isVideoSourceBufferUpdatingRef.current = false;

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      // 将 MediaSource 绑定到远程视频元素
      if (remoteVideoRef.current) {
        remoteVideoRef.current.src = URL.createObjectURL(mediaSource);
      }

      // 监听 sourceopen 事件
      mediaSource.addEventListener('sourceopen', () => {
        try {
          // 创建视频 SourceBuffer
          const buffer = mediaSource.addSourceBuffer(
            defaultMediaConfig.video_config.encode,
          );
          sourceBufferRef.current = buffer;

          // 监听 updateend 事件，处理缓冲队列
          buffer.addEventListener('updateend', () => {
            isVideoSourceBufferUpdatingRef.current = false;
            processVideoBufferQueue();
          });

          // 监听 error 事件
          buffer.addEventListener('error', (e) => {
            console.error('视频 SourceBuffer 错误:', e);
            isVideoSourceBufferUpdatingRef.current = false;
          });
        } catch (error) {
          console.error('创建视频 SourceBuffer 失败:', error);
        }
      });
    }

    // 音频：WebCodecs 可用时用 AudioDecoder + AudioWorklet 实时播放，否则走 MediaSource
    if (IS_WEBCODECS_SUPPORTED) {
      audioWebCodecsActiveRef.current = true;
      // 重置音频解码器
      if (audioDecoderRef.current) {
        audioDecoderRef.current.close();
        audioDecoderRef.current = null;
      }
      decodedAudioConfigRef.current = null;
      audioPlayTimeRef.current = 0;

      // 创建/复用 AudioContext 用于音频输出
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext({
            sampleRate: defaultMediaConfig.audio_config.sample_rate,
          });
        } catch (error) {
          console.error('[PrivacyVideoCall] 创建 AudioContext 失败:', error);
          audioContextRef.current = null;
        }
      }
      // 暂停音频播放时钟，等首个音频帧到达后再启动
      audioPlayTimeRef.current = 0;
    } else {
      audioWebCodecsActiveRef.current = false;
      if (audioMediaSourceRef.current) {
        if (audioMediaSourceRef.current.readyState === 'open') {
          audioMediaSourceRef.current.endOfStream();
        }
        audioMediaSourceRef.current = null;
      }
      audioSourceBufferRef.current = null;
      audioBufferQueueRef.current = [];
      isAudioSourceBufferUpdatingRef.current = false;

      // 创建 MediaSource 用于音频流
      const audioMediaSource = new MediaSource();
      audioMediaSourceRef.current = audioMediaSource;

      // 将 MediaSource 绑定到远程音频元素
      if (remoteAudioRef.current) {
        remoteAudioRef.current.src = URL.createObjectURL(audioMediaSource);
      }

      // 监听 sourceopen 事件
      audioMediaSource.addEventListener('sourceopen', () => {
        try {
          // 创建音频 SourceBuffer
          const audioBuffer = audioMediaSource.addSourceBuffer(
            defaultMediaConfig.audio_config.encode,
          );
          audioSourceBufferRef.current = audioBuffer;

          // 监听 updateend 事件，处理缓冲队列
          audioBuffer.addEventListener('updateend', () => {
            isAudioSourceBufferUpdatingRef.current = false;
            processAudioBufferQueue();
          });

          // 监听 error 事件
          audioBuffer.addEventListener('error', (e) => {
            console.error('音频 SourceBuffer 错误:', e);
            isAudioSourceBufferUpdatingRef.current = false;
          });
        } catch (error) {
          console.error('创建音频 SourceBuffer 失败:', error);
        }
      });
    }
    // processVideoBufferQueue / processAudioBufferQueue 在其后定义（TDZ），
    // 但它们在闭包回调中才被调用（那时已完成初始化），因此依赖数组置空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== 处理视频缓冲队列 ====================

  /**
   * 处理视频缓冲队列
   *
   * 说明:
   * SourceBuffer 一次只能处理一个缓冲区，
   * 所以需要使用队列来管理待处理的数据。
   * 当 SourceBuffer 完成当前操作后，从队列中取出下一个数据处理。
   */
  const processVideoBufferQueue = useCallback(() => {
    if (
      !sourceBufferRef.current ||
      !mediaSourceRef.current ||
      mediaSourceRef.current.readyState !== 'open' ||
      isVideoSourceBufferUpdatingRef.current ||
      videoBufferQueueRef.current.length === 0
    ) {
      return;
    }

    const data = videoBufferQueueRef.current.shift();
    if (data) {
      try {
        isVideoSourceBufferUpdatingRef.current = true;
        const newBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(newBuffer).set(data);
        sourceBufferRef.current.appendBuffer(newBuffer);
      } catch (error) {
        console.error('追加视频缓冲失败:', error);
        isVideoSourceBufferUpdatingRef.current = false;
        processVideoBufferQueue();
      }
    }
  }, []);

  // ==================== 处理音频缓冲队列 ====================

  /**
   * 处理音频缓冲队列
   *
   * 说明:
   * SourceBuffer 一次只能处理一个缓冲区，
   * 所以需要使用队列来管理待处理的数据。
   * 当 SourceBuffer 完成当前操作后，从队列中取出下一个数据处理。
   */
  const processAudioBufferQueue = useCallback(() => {
    if (
      !audioSourceBufferRef.current ||
      !audioMediaSourceRef.current ||
      audioMediaSourceRef.current.readyState !== 'open' ||
      isAudioSourceBufferUpdatingRef.current ||
      audioBufferQueueRef.current.length === 0
    ) {
      return;
    }

    const data = audioBufferQueueRef.current.shift();
    if (data) {
      try {
        isAudioSourceBufferUpdatingRef.current = true;
        const newBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(newBuffer).set(data);
        audioSourceBufferRef.current.appendBuffer(newBuffer);
      } catch (error) {
        console.error('追加音频缓冲失败:', error);
        isAudioSourceBufferUpdatingRef.current = false;
        processAudioBufferQueue();
      }
    }
  }, []);

  // ==================== WebCodecs 视频解码（低延迟管线） ====================

  /**
   * 刷新待解码的视频数据帧缓冲
   * 在解码器配置完成后，把之前暂存的数据帧按序交给解码器解码
   *
   * @param decoder - 已配置好的 VideoDecoder
   */
  const flushPendingVideoFrames = useCallback((decoder: VideoDecoder) => {
    const pending = pendingVideoFramesRef.current;
    pendingVideoFramesRef.current = [];
    if (pending.length > 0) {
      dlog(`刷新暂存视频帧 ${pending.length} 帧`);
      for (const chunk of pending) {
        try {
          decoder.decode(chunk);
        } catch (error) {
          console.error('[PrivacyVideoCall] 刷新暂存视频帧解码失败:', error);
        }
      }
    }
  }, []);

  /**
   * 配置远程视频解码器
   * 使用对方通过配置帧传来的解码器参数（codec、SPS/PPS）创建 VideoDecoder
   *
   * @param config - 解码器配置
   */
  const configureVideoDecoder = useCallback(
    (config: VideoDecoderConfig) => {
      try {
        if (videoDecoderRef.current) {
          videoDecoderRef.current.close();
          videoDecoderRef.current = null;
        }

        const decoderConfig: VideoDecoderConfig = {
          codec: config.codec,
          codedWidth: config.codedWidth,
          codedHeight: config.codedHeight,
          optimizeForLatency: true,
        };
        if (config.description) {
          decoderConfig.description = config.description;
        }

        const decoder = new VideoDecoder({
          output: (frame: VideoFrame) => {
            const canvas = videoCanvasRef.current;
            const ctx = videoCanvasCtxRef.current;
            if (canvas && ctx) {
              const w = frame.displayWidth || frame.codedWidth;
              const h = frame.displayHeight || frame.codedHeight;
              if (canvas.width !== w) canvas.width = w;
              if (canvas.height !== h) canvas.height = h;
              ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
            }
            frame.close();
          },
          error: (err) => {
            console.error('[PrivacyVideoCall] 视频解码器错误:', err);
            // 解码失败时请求关键帧以便尽快恢复
            requestKeyframeRef.current = true;
            // 请求对方重新发送解码器配置
            sendVideoDecoderConfig(decodedVideoConfigRef.current || config);
          },
        });

        decoder.configure(decoderConfig);
        videoDecoderRef.current = decoder;
        decodedVideoConfigRef.current = decoderConfig;
        dlog(
          `视频解码器已配置: codec=${decoderConfig.codec} ${
            decoderConfig.codedWidth
          }x${decoderConfig.codedHeight} 描述字节=${
            decoderConfig.description?.byteLength ?? 0
          }`,
        );
        // 配置完成后刷新之前缓冲的视频帧
        flushPendingVideoFrames(decoder);
      } catch (error) {
        console.error('[PrivacyVideoCall] 配置视频解码器失败:', error);
        dlog('❌ 视频解码器配置失败，原因见上方错误');
      }
    },
    [sendVideoDecoderConfig, flushPendingVideoFrames],
  );

  /**
   * 处理 WebCodecs 视频帧数据
   * 解析 24 字节帧头：配置帧 → 配置解码器；数据帧 → 交给解码器解码
   *
   * @param payload - 原始帧数据（含帧头）
   */
  const handleWebCodecsVideoFrame = useCallback(
    (payload: Uint8Array) => {
      if (payload.length < FRAME_HEADER_SIZE) return;
      const view = new DataView(
        payload.buffer,
        payload.byteOffset,
        FRAME_HEADER_SIZE,
      );
      const timestamp = Number(view.getBigUint64(0, false));
      const duration = Number(view.getBigUint64(8, false));
      const dataLen = view.getUint32(16, false);
      const flags = view.getUint32(20, false);

      // 解码器配置帧
      if ((flags & 2) !== 0) {
        try {
          const json = new TextDecoder().decode(
            payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
          );
          const cfg = JSON.parse(json);
          const config: VideoDecoderConfig = {
            codec: cfg.codec,
            codedWidth: cfg.codedWidth,
            codedHeight: cfg.codedHeight,
            optimizeForLatency: true,
          };
          if (Array.isArray(cfg.description) && cfg.description.length > 0) {
            config.description = Uint8Array.from(cfg.description);
          }
          configureVideoDecoder(config);
        } catch (error) {
          console.error('[PrivacyVideoCall] 解析视频解码器配置失败:', error);
        }
        return;
      }

      // 数据帧
      const decoder = videoDecoderRef.current;
      if (!decoder) {
        // 解码器尚未配置（首次通话配置帧可能晚于数据帧到达）。
        // 暂存数据帧，等配置帧到达后再按序刷新，避免首帧永久丢失。
        // 同时请求关键帧（关键帧会携带解码器配置），加速恢复。
        dlog(`视频解码器未就绪，缓冲数据帧(flags=${flags})并请求关键帧`);
        try {
          pendingVideoFramesRef.current.push(
            new EncodedVideoChunk({
              type: (flags & 1) !== 0 ? 'key' : 'delta',
              timestamp,
              duration,
              data: payload.subarray(
                FRAME_HEADER_SIZE,
                FRAME_HEADER_SIZE + dataLen,
              ),
            }),
          );
          // 缓冲过多时丢弃最旧的，防止内存膨胀
          if (pendingVideoFramesRef.current.length > 90) {
            pendingVideoFramesRef.current.shift();
          }
          requestKeyframeRef.current = true;
        } catch (error) {
          console.error('[PrivacyVideoCall] 缓冲视频帧失败:', error);
        }
        return;
      }
      try {
        const t = throughputRef.current;
        t.receivedFrames++;
        t.receivedBytes += dataLen;
        if (Date.now() - t.lastReportAt > 5000) {
          dlog(
            `[接收] 视频帧 5s 内: ${t.receivedFrames} 帧, ${(
              t.receivedBytes /
              1024 /
              5
            ).toFixed(1)} KB/s, 关键帧占比 ${
              t.receivedFrames
                ? Math.round((t.receivedKeyFrames / t.receivedFrames) * 100)
                : 0
            }%`,
          );
          t.lastReportAt = Date.now();
          t.receivedFrames = 0;
          t.receivedBytes = 0;
          t.receivedKeyFrames = 0;
        }
        if ((flags & 1) !== 0) {
          t.receivedKeyFrames++;
          videoFirstKeyframeReceivedRef.current = true;
        }
        const chunk = new EncodedVideoChunk({
          type: (flags & 1) !== 0 ? 'key' : 'delta',
          timestamp,
          duration,
          data: payload.subarray(
            FRAME_HEADER_SIZE,
            FRAME_HEADER_SIZE + dataLen,
          ),
        });
        // 解码器配置后尚未收到任何数据帧前，先刷新缓冲（按序解码）
        if (pendingVideoFramesRef.current.length > 0) {
          flushPendingVideoFrames(decoder);
        }
        decoder.decode(chunk);
      } catch (error) {
        console.error('[PrivacyVideoCall] 视频解码失败:', error);
      }
    },
    [configureVideoDecoder, flushPendingVideoFrames],
  );

  // ==================== WebCodecs 音频解码（低延迟管线） ====================

  /**
   * 播放解码后的音频数据
   * 通过 AudioContext + AudioBufferSourceNode 实时播放 AudioData
   * （WebCodecs 无内置 AudioSink，需把解码出的平面数据拷贝到 AudioBuffer 输出）
   *
   * @param audioData - 解码后的音频数据
   */
  const playDecodedAudio = useCallback((audioData: AudioData) => {
    const ctx = audioContextRef.current;
    if (!ctx) {
      console.warn('[PrivacyVideoCall] AudioContext 未初始化，丢弃音频');
      audioData.close();
      return;
    }

    // 恢复挂起状态（浏览器自动播放策略）
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .catch((e) =>
          console.error('[PrivacyVideoCall] 恢复 AudioContext 失败:', e),
        );
    }

    try {
      const numberOfChannels = audioData.numberOfChannels;
      const frames = audioData.numberOfFrames;
      const buffer = ctx.createBuffer(numberOfChannels, frames, ctx.sampleRate);

      // 逐声道拷贝：先分配该平面所需字节，再 copyTo 到 Float32Array
      for (let ch = 0; ch < numberOfChannels; ch++) {
        const planeSize = audioData.allocationSize({
          planeIndex: ch,
          format: 'f32-planar',
          frameOffset: 0,
          frameCount: frames,
        });
        const plane = new Float32Array(planeSize / 4);
        audioData.copyTo(plane, {
          planeIndex: ch,
          format: 'f32-planar',
          frameOffset: 0,
          frameCount: frames,
        });
        buffer.copyToChannel(plane, ch);
      }
      audioData.close();

      // 用 AudioBufferSourceNode 排程播放，按到达时间错开避免重叠
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      // 首个音频帧从当前时间+小抖动开始，后续帧排在前一帧结束之后
      let startTime = audioPlayTimeRef.current;
      if (startTime === 0) {
        startTime = now + 0.05;
      }
      if (startTime < now) {
        startTime = now;
      }
      source.start(startTime);
      // 更新播放时钟：该 buffer 播放时长（秒）
      audioPlayTimeRef.current = startTime + frames / ctx.sampleRate;
    } catch (error) {
      console.error('[PrivacyVideoCall] 播放音频失败:', error);
      audioData.close();
    }
  }, []);

  /**
   * 配置远程音频解码器
   * 使用对方通过配置帧传来的解码器参数（codec、sampleRate、channels）创建 AudioDecoder
   *
   * @param config - 音频解码器配置
   */
  const configureAudioDecoder = useCallback(
    (config: AudioDecoderConfig) => {
      try {
        if (audioDecoderRef.current) {
          audioDecoderRef.current.close();
          audioDecoderRef.current = null;
        }

        const decoderConfig: AudioDecoderConfig = {
          codec: config.codec,
          sampleRate: config.sampleRate,
          numberOfChannels: config.numberOfChannels,
        };
        if (config.description) {
          decoderConfig.description = config.description;
        }

        const decoder = new AudioDecoder({
          output: (audioData: AudioData) => {
            playDecodedAudio(audioData);
          },
          error: (err) => {
            console.error('[PrivacyVideoCall] 音频解码器错误:', err);
          },
        });

        decoder.configure(decoderConfig);
        audioDecoderRef.current = decoder;
        decodedAudioConfigRef.current = decoderConfig;
        audioPlayTimeRef.current = 0;
        console.log(
          '[PrivacyVideoCall] 音频解码器已配置:',
          decoderConfig.codec,
          'sampleRate=',
          decoderConfig.sampleRate,
          'channels=',
          decoderConfig.numberOfChannels,
        );
      } catch (error) {
        console.error('[PrivacyVideoCall] 配置音频解码器失败:', error);
      }
    },
    [playDecodedAudio],
  );

  /**
   * 处理 WebCodecs 音频帧数据
   * 解析 24 字节帧头：配置帧 → 配置解码器；数据帧 → 交给解码器解码
   *
   * @param payload - 原始音频数据（含帧头）
   */
  const handleWebCodecsAudioFrame = useCallback(
    (payload: Uint8Array) => {
      if (payload.length < FRAME_HEADER_SIZE) return;
      const view = new DataView(
        payload.buffer,
        payload.byteOffset,
        FRAME_HEADER_SIZE,
      );
      const timestamp = Number(view.getBigUint64(0, false));
      const duration = Number(view.getBigUint64(8, false));
      const dataLen = view.getUint32(16, false);
      const flags = view.getUint32(20, false);

      // 音频解码器配置帧
      if ((flags & 2) !== 0) {
        try {
          const json = new TextDecoder().decode(
            payload.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + dataLen),
          );
          const cfg = JSON.parse(json);
          const config: AudioDecoderConfig = {
            codec: cfg.codec,
            sampleRate: cfg.sampleRate,
            numberOfChannels: cfg.numberOfChannels,
          };
          if (Array.isArray(cfg.description) && cfg.description.length > 0) {
            config.description = Uint8Array.from(cfg.description);
          }
          configureAudioDecoder(config);
        } catch (error) {
          console.error('[PrivacyVideoCall] 解析音频解码器配置失败:', error);
        }
        return;
      }

      // 音频数据帧
      const decoder = audioDecoderRef.current;
      if (!decoder) {
        console.warn('[PrivacyVideoCall] 音频解码器未就绪，丢弃帧');
        return;
      }
      try {
        const t = throughputRef.current;
        t.receivedFrames++;
        t.receivedBytes += dataLen;
        if (Date.now() - t.lastReportAt > 5000) {
          dlog(
            `[接收] 音频帧 5s 内: ${t.receivedFrames} 帧, ${(
              t.receivedBytes /
              1024 /
              5
            ).toFixed(1)} KB/s`,
          );
          t.lastReportAt = Date.now();
          t.receivedFrames = 0;
          t.receivedBytes = 0;
        }
        const chunk = new EncodedAudioChunk({
          type: 'key',
          timestamp,
          duration,
          data: payload.subarray(
            FRAME_HEADER_SIZE,
            FRAME_HEADER_SIZE + dataLen,
          ),
        });
        decoder.decode(chunk);
      } catch (error) {
        console.error('[PrivacyVideoCall] 音频解码失败:', error);
      }
    },
    [configureAudioDecoder],
  );

  // ==================== 设置事件监听器 + 组件初始化 ====================

  /**
   * 设置所有事件监听器并初始化组件
   *
   * 重要：必须先注册监听器，再发送通话信令
   * 否则服务端的视频帧可能在监听器注册前到达，导致初始化段丢失
   * 初始化段一旦丢失，后续所有帧都无法解码 → 黑屏
   *
   * 监听的事件:
   * - video_frame: 接收视频帧数据
   * - audio_frame: 接收音频帧数据
   * - media_control: 接收媒体控制命令
   * - video_call_accept: 对方接受通话
   * - video_call_reject: 对方拒绝通话
   * - video_call_end: 对方结束通话
   */
  useEffect(() => {
    const setup = async () => {
      // ==================== 第一步：注册所有事件监听器 ====================
      // 必须在任何信令之前完成，避免视频帧到达时监听器未就绪

      // 监听视频帧数据
      const unlistenVideo = await listen<number[]>('video_frame', (event) => {
        if (event.payload.length > 0) {
          if (IS_WEBCODECS_SUPPORTED) {
            handleWebCodecsVideoFrame(new Uint8Array(event.payload));
          } else {
            const data = new Uint8Array(event.payload);
            // 将数据添加到队列
            videoBufferQueueRef.current.push(data);
            // 尝试处理队列
            processVideoBufferQueue();
          }
        }
      });

      // 监听音频帧数据
      const unlistenAudio = await listen<number[]>('audio_frame', (event) => {
        if (event.payload.length > 0) {
          if (audioWebCodecsActiveRef.current) {
            handleWebCodecsAudioFrame(new Uint8Array(event.payload));
          } else {
            const data = new Uint8Array(event.payload);
            audioBufferQueueRef.current.push(data);
            processAudioBufferQueue();
          }
        }
      });

      // 监听媒体控制命令
      const unlistenControl = await listen<string>('media_control', (event) => {
        try {
          // 兼容处理：payload可能是string或object（Tauri序列化差异）
          let controlStr: string;
          if (typeof event.payload === 'string') {
            controlStr = event.payload;
          } else {
            controlStr = JSON.stringify(event.payload);
          }
          const control: MediaControl = JSON.parse(controlStr);
          handleMediaControl(control);
        } catch (error) {
          console.error('处理媒体控制失败:', error);
        }
      });

      // 监听对方接受通话
      const unlistenAccept = await listen<string>(
        'video_call_accept',
        (event) => {
          console.log('对方接受了视频通话:', event.payload);
          setIsWaitingResponse(false);
          message.success('对方已接受视频通话');
          // 通过 ref 调用最新版本的 initLocalMedia，避免闭包陷阱
          initLocalMediaRef.current();
        },
      );

      // 监听对方拒绝通话
      const unlistenReject = await listen<string>(
        'video_call_reject',
        (event) => {
          console.log('对方拒绝了视频通话:', event.payload);
          setIsWaitingResponse(false);
          message.info('对方拒绝了视频通话');
          // 关闭视频通话（本方主动结束，通知对方）
          handleEndCall(true);
        },
      );

      // 监听对方结束通话
      const unlistenEnd = await listen<string>('video_call_end', (event) => {
        console.log('对方结束了视频通话:', event.payload);
        message.info('对方已结束视频通话');
        // 对方已结束，本方不需要再发送结束通知，仅做本地清理
        handleEndCall(false);
      });

      // 监听媒体信息（通过MediaInfo通道传输）
      const unlistenMediaInfo = await listen<string>('media_info', (event) => {
        try {
          const mediaInfo: MediaInfo = JSON.parse(event.payload);
          handleMediaInfo(mediaInfo);
        } catch (error) {
          console.error('处理媒体信息失败:', error);
        }
      });

      // 监听对方媒体接收器就绪信号
      // 这是解决视频黑屏问题的关键：只有收到此信号后才开始发送媒体数据
      const unlistenMediaReady = await listen<string>(
        'media_receiver_ready',
        (event) => {
          dlog('对方媒体接收器已就绪:', event.payload);
          setIsRemoteReceiverReady(true);
          // 对方可能刚重启了接收器，立即请求关键帧并重发解码器配置，加速恢复
          if (IS_WEBCODECS_SUPPORTED) {
            requestKeyframeRef.current = true;
            if (lastSentVideoConfigRef.current) {
              dlog('对方已就绪，重发视频解码器配置');
              sendVideoDecoderConfig(lastSentVideoConfigRef.current);
            }
            if (lastSentAudioConfigRef.current) {
              dlog('对方已就绪，重发音频解码器配置');
              sendAudioDecoderConfig(lastSentAudioConfigRef.current);
            }
          }
          // 通过 ref 调用最新版本的 startSendingMedia
          startSendingMediaRef.current();
        },
      );

      // 保存所有取消监听函数
      unlistenRef.current = [
        unlistenVideo,
        unlistenAudio,
        unlistenControl,
        unlistenAccept,
        unlistenReject,
        unlistenEnd,
        unlistenMediaInfo,
        unlistenMediaReady,
      ];

      console.log('[PrivacyVideoCall] 所有事件监听器已注册完成');
    };

    setup();

    // 组件卸载时清理所有监听器
    return () => {
      unlistenRef.current.forEach((unlisten) => unlisten());
    };
    // 关键修复：移除 initLocalMedia 和 startSendingMedia 依赖
    // 改用 ref 调用（见上方 initLocalMediaRef / startSendingMediaRef），
    // 避免因 isRemoteReceiverReady 变化导致 initLocalMedia 引用变化，
    // 从而触发此 useEffect 重新执行 → 注销再注册所有监听器 → 丢失事件
  }, [
    processVideoBufferQueue,
    processAudioBufferQueue,
    handleWebCodecsVideoFrame,
    handleWebCodecsAudioFrame,
    sendVideoDecoderConfig,
    sendAudioDecoderConfig,
  ]);

  // ==================== 处理媒体控制命令 ====================

  /**
   * 处理媒体控制命令
   *
   * @param control - 媒体控制命令对象
   */
  const handleMediaControl = (control: MediaControl) => {
    switch (control.control_type) {
      case 'VideoToggle':
        // 对方切换了视频开关
        setMediaState((prev) => ({ ...prev, videoEnabled: control.enabled }));
        break;
      case 'AudioToggle':
        // 对方切换了音频开关
        setMediaState((prev) => ({ ...prev, audioEnabled: control.enabled }));
        break;
      case 'Pause':
        // 对方暂停了通话
        setMediaState((prev) => ({ ...prev, isPaused: true }));
        break;
      case 'Resume':
        // 对方恢复了通话
        setMediaState((prev) => ({ ...prev, isPaused: false }));
        break;
      case 'EndCall':
        // 对方结束了通话，本方不需要再发送结束通知
        handleEndCall(false);
        break;
    }
  };

  // ==================== 处理媒体信息 ====================

  /**
   * 处理接收到的媒体信息
   * 通过MediaInfo通道传输的实时媒体状态信息
   *
   * @param info - 媒体信息对象
   */
  const handleMediaInfo = useCallback((info: MediaInfo) => {
    const infoType =
      typeof info.info_type === 'string'
        ? info.info_type
        : (info.info_type as { Custom: string }).Custom;
    console.log(
      `[MediaInfo] 收到媒体信息: type=${infoType}, data=${info.data}`,
    );

    try {
      const data = JSON.parse(info.data);
      switch (infoType) {
        case 'ResolutionChange':
          console.log(`[MediaInfo] 对方分辨率变化: ${JSON.stringify(data)}`);
          break;
        case 'BitrateChange':
          console.log(`[MediaInfo] 对方码率调整: ${JSON.stringify(data)}`);
          break;
        case 'FrameRateStats':
          console.log(`[MediaInfo] 对方帧率统计: ${JSON.stringify(data)}`);
          break;
        case 'NetworkQuality':
          console.log(`[MediaInfo] 对方网络质量: ${JSON.stringify(data)}`);
          break;
        case 'EncoderInfo':
          console.log(`[MediaInfo] 对方编码器信息: ${JSON.stringify(data)}`);
          break;
        default:
          console.log(`[MediaInfo] 自定义媒体信息: ${infoType} - ${info.data}`);
      }
    } catch {
      console.log(`[MediaInfo] 原始数据: type=${infoType}, data=${info.data}`);
    }
  }, []);

  // ==================== 发送媒体信息 ====================

  /**
   * 发送媒体信息给对方
   * 通过MediaInfo通道发送，与视频/音频数据通道分离
   * 避免大数据帧阻塞控制信息
   *
   * @param infoType - 媒体信息类型
   * @param data - 媒体信息数据
   */
  const sendMediaInfo = useCallback(
    async (infoType: string, data: Record<string, unknown>) => {
      try {
        await invoke('send_p2p_media_info', {
          infoType,
          data: JSON.stringify(data),
          targetUuid: friendId,
        });
      } catch (error) {
        console.error('发送媒体信息失败:', error);
      }
    },
    [friendId],
  );

  /**
   * 启动媒体信息定时发送
   * 每隔2秒通过MediaInfo通道发送一次帧率统计信息
   */
  const startMediaInfoReporting = useCallback(() => {
    if (mediaInfoIntervalRef.current) {
      clearInterval(mediaInfoIntervalRef.current);
    }
    mediaStartTimeRef.current = Date.now();

    mediaInfoIntervalRef.current = setInterval(() => {
      if (mediaState.isInCall) {
        sendMediaInfo('FrameRateStats', {
          frameRate: mediaInfoStatsRef.current.frameRate,
          videoBitrate: mediaInfoStatsRef.current.videoBitrate,
          audioBitrate: mediaInfoStatsRef.current.audioBitrate,
          latency: mediaInfoStatsRef.current.latency,
          droppedFrames: mediaInfoStatsRef.current.droppedFrames,
        });

        // 周期性状态诊断
        dlog(
          `状态: 视频编码器=${videoEncoderRef.current?.state ?? 'none'}(${
            videoEncoderRef.current?.encodeQueueSize ?? 0
          }) 视频解码器=${videoDecoderRef.current?.state ?? 'none'}(${
            videoDecoderRef.current?.decodeQueueSize ?? 0
          }) 音频编码器=${audioEncoderRef.current?.state ?? 'none'}(${
            audioEncoderRef.current?.encodeQueueSize ?? 0
          }) 音频解码器=${audioDecoderRef.current?.state ?? 'none'}(${
            audioDecoderRef.current?.decodeQueueSize ?? 0
          }) 对方就绪=${isRemoteReceiverReady} AudioContext=${
            audioContextRef.current?.state ?? 'none'
          } 已收首关键帧=${videoFirstKeyframeReceivedRef.current} 缓冲帧=${
            pendingVideoFramesRef.current.length
          }`,
        );

        // 黑屏看门狗：通话进行超过 4 秒仍未收到首个关键帧，
        // 说明配置帧/关键帧可能丢失，主动请求关键帧（会携带解码器配置）来恢复
        if (
          IS_WEBCODECS_SUPPORTED &&
          Date.now() - mediaStartTimeRef.current > 4000 &&
          !videoFirstKeyframeReceivedRef.current &&
          videoDecoderRef.current
        ) {
          dlog('⚠️ 4秒未收到视频关键帧，主动请求关键帧恢复');
          requestKeyframeRef.current = true;
        }
      }
    }, 2000);
  }, [mediaState.isInCall, sendMediaInfo, isRemoteReceiverReady]);

  /**
   * 停止媒体信息定时发送
   */
  const stopMediaInfoReporting = useCallback(() => {
    if (mediaInfoIntervalRef.current) {
      clearInterval(mediaInfoIntervalRef.current);
      mediaInfoIntervalRef.current = null;
    }
  }, []);

  // ==================== 切换视频 ====================

  /**
   * 切换本地视频开关
   *
   * 流程:
   * 1. 切换本地状态
   * 2. 启用/禁用视频轨道
   * 3. 发送控制命令给对方
   */
  const toggleVideo = async () => {
    const newState = !mediaState.videoEnabled;
    setMediaState((prev) => ({ ...prev, videoEnabled: newState }));

    // 启用/禁用视频轨道
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = newState;
      }
    }

    // 发送控制命令给对方
    await invoke('send_p2p_media_control', {
      controlType: 'VideoToggle',
      enabled: newState,
      targetUuid: friendId,
    });
  };

  // ==================== 切换音频 ====================

  /**
   * 切换本地音频开关
   *
   * 流程:
   * 1. 切换本地状态
   * 2. 启用/禁用音频轨道
   * 3. 发送控制命令给对方
   */
  const toggleAudio = async () => {
    const newState = !mediaState.audioEnabled;
    setMediaState((prev) => ({ ...prev, audioEnabled: newState }));

    // 启用/禁用音频轨道
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = newState;
      }
    }

    // 发送控制命令给对方
    await invoke('send_p2p_media_control', {
      controlType: 'AudioToggle',
      enabled: newState,
      targetUuid: friendId,
    });
  };

  // ==================== 结束通话 ====================

  /**
   * 结束视频通话
   *
   * 流程:
   * 1. 停止录制器
   * 2. 停止媒体轨道
   * 3. 关闭媒体源
   * 4. 发送结束通知给对方
   * 5. 调用关闭回调
   */
  const handleEndCall = useCallback(
    async (notifyOtherParty: boolean = true) => {
      // 防止重复执行
      if (isCallEndedRef.current) {
        return;
      }
      isCallEndedRef.current = true;
      dlog(
        `结束通话: 通知对方=${notifyOtherParty} 视频编码器=${
          videoEncoderRef.current ? '运行中' : '无'
        } 视频解码器=${videoDecoderRef.current ? '运行中' : '无'} 音频编码器=${
          audioEncoderRef.current ? '运行中' : '无'
        } 音频解码器=${audioDecoderRef.current ? '运行中' : '无'}`,
      );

      // 停止媒体信息定时发送
      stopMediaInfoReporting();

      // 停止视频录制器
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      // 停止音频录制器
      if (
        audioRecorderRef.current &&
        audioRecorderRef.current.state !== 'inactive'
      ) {
        audioRecorderRef.current.stop();
      }
      audioRecorderRef.current = null;

      // 停止 WebCodecs 视频编码器
      if (videoEncoderRef.current) {
        try {
          videoEncoderRef.current.close();
        } catch (e) {
          console.error('关闭视频编码器失败:', e);
        }
        videoEncoderRef.current = null;
      }

      // 停止视频轨道处理器（读取循环随之结束）
      if (videoReaderRef.current) {
        try {
          // 取消 reader 会打断挂起的 read() 并使流解锁，避免 "Cannot cancel a locked stream"
          await videoReaderRef.current.cancel();
        } catch (e) {
          console.error('取消视频轨道读取失败:', e);
        }
        videoReaderRef.current = null;
      }
      videoTrackProcessorRef.current = null;

      // 停止 WebCodecs 音频编码器
      if (audioEncoderRef.current) {
        try {
          audioEncoderRef.current.close();
        } catch (e) {
          console.error('关闭音频编码器失败:', e);
        }
        audioEncoderRef.current = null;
      }

      // 停止音频轨道处理器
      if (audioReaderRef.current) {
        try {
          await audioReaderRef.current.cancel();
        } catch (e) {
          console.error('取消音频轨道读取失败:', e);
        }
        audioReaderRef.current = null;
      }
      audioTrackProcessorRef.current = null;
      lastSentAudioConfigRef.current = null;

      // 停止周期关键帧定时器
      if (keyframeTimerRef.current) {
        clearInterval(keyframeTimerRef.current);
        keyframeTimerRef.current = null;
      }
      requestKeyframeRef.current = false;

      // 清除媒体延迟发送定时器（通话已结束，不再延迟启动）
      if (mediaSendDelayTimerRef.current) {
        clearTimeout(mediaSendDelayTimerRef.current);
        mediaSendDelayTimerRef.current = null;
      }

      // 停止所有媒体轨道并释放硬件设备（摄像头/麦克风）
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      // 关闭 WebCodecs 视频解码器
      if (videoDecoderRef.current) {
        try {
          videoDecoderRef.current.close();
        } catch (e) {
          console.error('关闭视频解码器失败:', e);
        }
        videoDecoderRef.current = null;
      }
      decodedVideoConfigRef.current = null;
      pendingVideoFramesRef.current = [];
      videoFirstKeyframeReceivedRef.current = false;

      // 关闭 WebCodecs 音频解码器
      if (audioDecoderRef.current) {
        try {
          audioDecoderRef.current.close();
        } catch (e) {
          console.error('关闭音频解码器失败:', e);
        }
        audioDecoderRef.current = null;
      }
      decodedAudioConfigRef.current = null;

      // 关闭音频输出 AudioContext
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.error('关闭 AudioContext 失败:', e);
        }
        audioContextRef.current = null;
      }
      audioPlayTimeRef.current = 0;
      audioWebCodecsActiveRef.current = false;

      // 释放远程视频画布捕获流
      if (remoteCanvasStreamRef.current) {
        remoteCanvasStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        remoteCanvasStreamRef.current = null;
      }
      videoCanvasCtxRef.current = null;

      // 关闭视频 MediaSource 并清理引用
      if (mediaSourceRef.current) {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
        mediaSourceRef.current = null;
      }
      sourceBufferRef.current = null;
      videoBufferQueueRef.current = [];
      isVideoSourceBufferUpdatingRef.current = false;

      // 关闭音频 MediaSource 并清理引用
      if (audioMediaSourceRef.current) {
        if (audioMediaSourceRef.current.readyState === 'open') {
          audioMediaSourceRef.current.endOfStream();
        }
        audioMediaSourceRef.current = null;
      }
      audioSourceBufferRef.current = null;
      audioBufferQueueRef.current = [];
      isAudioSourceBufferUpdatingRef.current = false;

      // 仅当本方主动结束时才发送结束通知给对方
      // 收到对方结束消息时不需要再回复，避免互相发送结束消息
      if (notifyOtherParty) {
        try {
          await invoke('send_p2p_video_call_end', {
            targetUuid: friendId,
          });
        } catch (error) {
          console.error('发送结束通知失败:', error);
        }
      }

      // 更新状态
      setMediaState((prev) => ({ ...prev, isInCall: false }));

      // 重置媒体发送标记，允许下次通话重新启动
      isMediaSendingRef.current = false;

      // 调用关闭回调
      onClose?.();
    },
    [friendId, onClose, stopMediaInfoReporting],
  );

  // ==================== 退出隐私聊天 ====================

  /**
   * 退出隐私聊天
   *
   * 流程:
   * 1. 结束视频通话
   * 2. 关闭P2P连接
   * 3. 关闭当前窗口
   */
  const handleExit = useCallback(async () => {
    // 先结束视频通话
    await handleEndCall(true);

    try {
      // 关闭P2P连接
      await invoke('close_p2p_connection', {
        targetUuid: friendId,
      });
    } catch (error) {
      console.error('关闭P2P连接失败:', error);
    }

    // 关闭当前窗口
    try {
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
    } catch (error) {
      console.error('关闭窗口失败:', error);
    }
  }, [friendId, handleEndCall]);

  // ==================== 重启媒体接收器 ====================

  /**
   * 重启媒体接收器
   * 作为视频黑屏问题的兜底解决方案
   *
   * 当视频出现黑屏或音频无法播放时，可以手动重启媒体接收器
   * 流程:
   * 1. 停止当前的媒体录制器
   * 2. 重置远程媒体接收器
   * 3. 重新初始化远程媒体接收器
   * 4. 发送重新就绪信号
   */
  const handleRestartMedia = useCallback(async () => {
    if (isRestarting) {
      return;
    }

    setIsRestarting(true);
    console.log('[PrivacyVideoCall] 开始重启媒体接收器...');
    dlog('开始重启媒体接收器');

    try {
      // 1. 停止当前的媒体录制器
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (
        audioRecorderRef.current &&
        audioRecorderRef.current.state !== 'inactive'
      ) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }

      // 1.1 停止 WebCodecs 视频编码器
      if (videoEncoderRef.current) {
        try {
          videoEncoderRef.current.close();
        } catch (e) {
          console.error('关闭视频编码器失败:', e);
        }
        videoEncoderRef.current = null;
      }
      if (videoReaderRef.current) {
        try {
          await videoReaderRef.current.cancel();
        } catch (e) {
          console.error('取消视频轨道读取失败:', e);
        }
        videoReaderRef.current = null;
      }
      videoTrackProcessorRef.current = null;
      if (keyframeTimerRef.current) {
        clearInterval(keyframeTimerRef.current);
        keyframeTimerRef.current = null;
      }
      // 清除媒体延迟发送定时器（重启后会重新设置）
      if (mediaSendDelayTimerRef.current) {
        clearTimeout(mediaSendDelayTimerRef.current);
        mediaSendDelayTimerRef.current = null;
      }

      // 1.2 停止 WebCodecs 音频编码器
      if (audioEncoderRef.current) {
        try {
          audioEncoderRef.current.close();
        } catch (e) {
          console.error('关闭音频编码器失败:', e);
        }
        audioEncoderRef.current = null;
      }
      if (audioReaderRef.current) {
        try {
          await audioReaderRef.current.cancel();
        } catch (e) {
          console.error('取消音频轨道读取失败:', e);
        }
        audioReaderRef.current = null;
      }
      audioTrackProcessorRef.current = null;
      lastSentAudioConfigRef.current = null;

      // 2. 重置远程媒体接收器
      if (IS_WEBCODECS_SUPPORTED) {
        // 重置 WebCodecs 视频解码器与画布捕获流
        if (videoDecoderRef.current) {
          try {
            videoDecoderRef.current.close();
          } catch (e) {
            console.error('关闭视频解码器失败:', e);
          }
          videoDecoderRef.current = null;
        }
        decodedVideoConfigRef.current = null;
        pendingVideoFramesRef.current = [];
        videoFirstKeyframeReceivedRef.current = false;
        // 重置 WebCodecs 音频解码器
        if (audioDecoderRef.current) {
          try {
            audioDecoderRef.current.close();
          } catch (e) {
            console.error('关闭音频解码器失败:', e);
          }
          audioDecoderRef.current = null;
        }
        decodedAudioConfigRef.current = null;
        audioPlayTimeRef.current = 0;
        if (remoteCanvasStreamRef.current) {
          remoteCanvasStreamRef.current
            .getTracks()
            .forEach((track) => track.stop());
          remoteCanvasStreamRef.current = null;
        }
        videoCanvasRef.current = null;
        videoCanvasCtxRef.current = null;
      } else {
        if (mediaSourceRef.current) {
          if (mediaSourceRef.current.readyState === 'open') {
            mediaSourceRef.current.endOfStream();
          }
          mediaSourceRef.current = null;
        }
        sourceBufferRef.current = null;
        videoBufferQueueRef.current = [];
        isVideoSourceBufferUpdatingRef.current = false;
      }

      if (audioMediaSourceRef.current) {
        if (audioMediaSourceRef.current.readyState === 'open') {
          audioMediaSourceRef.current.endOfStream();
        }
        audioMediaSourceRef.current = null;
      }
      audioSourceBufferRef.current = null;
      audioBufferQueueRef.current = [];
      isAudioSourceBufferUpdatingRef.current = false;

      // 3. 重新初始化远程媒体接收器
      await initRemoteMediaReceiver();

      // 4. 发送重新就绪信号
      await sendMediaReady();

      // 5. 重置状态
      setIsRemoteReceiverReady(false);

      // 允许重新启动媒体发送
      isMediaSendingRef.current = false;

      // 6. 如果本地媒体流存在，重新开始发送
      if (localStreamRef.current && isRemoteReceiverReady) {
        startSendingMedia();
      }

      console.log('[PrivacyVideoCall] 媒体接收器重启完成');
      message.success('媒体接收器已重启');
    } catch (error) {
      console.error('重启媒体接收器失败:', error);
      message.error('重启媒体接收器失败');
    } finally {
      setIsRestarting(false);
    }
  }, [
    isRestarting,
    initRemoteMediaReceiver,
    sendMediaReady,
    isRemoteReceiverReady,
    startSendingMedia,
  ]);

  // ==================== 发送视频通话邀请 ====================

  /**
   * 发送视频通话邀请
   * 仅发起方调用
   */
  const sendVideoCallInvite = useCallback(async () => {
    try {
      await invoke('send_p2p_video_call_invite', {
        targetUuid: friendId,
        fromName: null, // 可以传入当前用户昵称
      });
      setIsWaitingResponse(true);
    } catch (error) {
      console.error('发送视频通话邀请失败:', error);
      message.error('发送视频通话邀请失败');
      handleEndCall(true);
    }
  }, [friendId, handleEndCall]);

  // ==================== 发送视频通话响应 ====================

  /**
   * 发送视频通话响应
   * 仅被邀请方调用
   *
   * @param accept - 是否接受邀请
   */
  const sendVideoCallResponse = useCallback(
    async (accept: boolean) => {
      try {
        await invoke('send_p2p_video_call_response', {
          targetUuid: friendId,
          accept,
          mediaConfig: accept ? JSON.stringify(defaultMediaConfig) : null,
          rejectReason: accept ? null : '用户拒绝',
        });

        if (accept) {
          // 接受邀请，开始初始化本地媒体（通过 ref 调用最新版本）
          await initLocalMediaRef.current();
        } else {
          // 拒绝邀请，关闭视频通话（本方主动拒绝，通知对方）
          handleEndCall(true);
        }
      } catch (error) {
        console.error('发送视频通话响应失败:', error);
        message.error('发送视频通话响应失败');
        handleEndCall(true);
      }
    },
    [friendId, initLocalMediaRef, handleEndCall],
  );

  // ==================== 组件初始化 ====================

  /**
   * 组件初始化
   *
   * 流程（严格按序执行，避免竞态条件）:
   * 1. 等待事件监听器注册完成（确保视频帧不丢失）
   * 2. 初始化远程媒体接收器
   * 3. 如果是发起方，发送邀请，等待对方接受
   * 4. 如果是被邀请方，直接初始化本地媒体（PrivacyChat 已发送接受响应）
   *
   * 注意：此 effect 只执行一次（空依赖数组），使用 ref 来访问最新的函数
   */
  useEffect(() => {
    isMountedRef.current = true;

    const init = async () => {
      if (!isMountedRef.current) return;

      // 等待事件监听器注册完成
      // 监听器在另一个useEffect中异步注册，需要等待其完成
      // 否则服务端发送的视频帧可能在监听器注册前到达，导致初始化段丢失
      const maxWait = 50; // 最多等待5秒
      for (let i = 0; i < maxWait; i++) {
        if (!isMountedRef.current) return;
        if (unlistenRef.current.length > 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!isMountedRef.current) return;

      if (unlistenRef.current.length === 0) {
        console.warn('[PrivacyVideoCall] 事件监听器注册超时，继续初始化');
      } else {
        console.log('[PrivacyVideoCall] 事件监听器已就绪，开始初始化');
      }

      // 初始化远程媒体接收器
      await initRemoteMediaReceiver();

      if (!isMountedRef.current) return;

      if (isInitiator) {
        // 发起方：发送邀请
        await sendVideoCallInvite();
      } else {
        // 被邀请方：PrivacyChat 已发送接受响应，直接初始化本地媒体
        // 不需要再次发送 video_call_response
        console.log('[PrivacyVideoCall] 被邀请方，直接初始化本地媒体');
        await initLocalMediaRef.current();
      }
    };

    init();

    // 组件真正卸载时清理资源
    // isCallEndedRef 防止重复调用：如果通话已通过事件处理器结束，则不再发送结束消息
    return () => {
      console.log('[PrivacyVideoCall] 组件卸载');
      isMountedRef.current = false;
      handleEndCall(true);
    };
    // 空依赖数组确保此 effect 只执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== 渲染 ====================

  return (
    <div className={styles.videoCallContainer}>
      {/* 加载状态遮罩 */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <Spin
            size="large"
            tip={isWaitingResponse ? '等待对方接受...' : '正在建立视频连接...'}
          />
        </div>
      )}

      {/* 视频区域 */}
      <div className={styles.videoWrapper}>
        {/* 远程视频 - 对方视频 */}
        <div className={styles.remoteVideo}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={styles.video}
          />
          {/* 远程音频 - 对方音频 */}
          <audio ref={remoteAudioRef} autoPlay />
          {/* 等待连接提示 */}
          {!isConnected && (
            <div className={styles.waitingOverlay}>
              <span>
                {isWaitingResponse ? '等待对方接受...' : '等待对方连接...'}
              </span>
            </div>
          )}
        </div>

        {/* 本地视频 - 自己的视频 */}
        <div className={styles.localVideo}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={styles.video}
          />
          {/* 视频关闭遮罩 */}
          {!mediaState.videoEnabled && (
            <div className={styles.videoOffOverlay}>
              <VideoCameraOutlined style={{ fontSize: 32 }} />
            </div>
          )}
        </div>
      </div>

      {/* 控制按钮区域 */}
      <div className={styles.controls}>
        {/* 音频开关按钮 */}
        <Tooltip title={mediaState.audioEnabled ? '关闭麦克风' : '开启麦克风'}>
          <Button
            type={mediaState.audioEnabled ? 'primary' : 'default'}
            shape="circle"
            size="large"
            icon={
              mediaState.audioEnabled ? (
                <AudioOutlined />
              ) : (
                <AudioMutedOutlined />
              )
            }
            onClick={toggleAudio}
            className={styles.controlButton}
          />
        </Tooltip>

        {/* 视频开关按钮 */}
        <Tooltip title={mediaState.videoEnabled ? '关闭摄像头' : '开启摄像头'}>
          <Button
            type={mediaState.videoEnabled ? 'primary' : 'default'}
            shape="circle"
            size="large"
            icon={<VideoCameraOutlined />}
            onClick={toggleVideo}
            className={styles.controlButton}
          />
        </Tooltip>

        {/* 重启媒体按钮 - 作为黑屏问题的兜底方案 */}
        <Tooltip title="重启视频/音频 (解决黑屏问题)">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<ReloadOutlined spin={isRestarting} />}
            onClick={handleRestartMedia}
            disabled={isRestarting || !isConnected}
            className={styles.controlButton}
          />
        </Tooltip>

        {/* 结束通话按钮 */}
        <Tooltip title="结束通话">
          <Button
            type="primary"
            danger
            shape="circle"
            size="large"
            icon={<PhoneOutlined />}
            onClick={() => handleEndCall(true)}
            className={styles.endCallButton}
          />
        </Tooltip>

        {/* 退出按钮 */}
        <Tooltip title="退出隐私聊天">
          <Button
            type="default"
            danger
            shape="circle"
            size="large"
            icon={<LogoutOutlined />}
            onClick={handleExit}
            className={styles.exitButton}
          />
        </Tooltip>
      </div>
    </div>
  );
};

// 使用 React.memo 优化性能，避免不必要的重新渲染
export default React.memo(PrivacyVideoCall);
