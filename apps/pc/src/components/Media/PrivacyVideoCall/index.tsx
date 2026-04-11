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

  // ==================== 默认媒体配置 ====================

  /**
   * 默认媒体配置
   * - 视频分辨率: 640x480 (低画质)
   * - 帧率: 15fps
   * - 编码: VP8
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

  // ==================== 发送媒体就绪信号 ====================

  /**
   * 发送媒体接收就绪信号
   * 通知对方本地已准备好接收媒体数据
   */
  const sendMediaReady = useCallback(async () => {
    try {
      console.log('[PrivacyVideoCall] 发送媒体接收就绪信号');
      await invoke('send_p2p_media_ready', {
        targetUuid: friendId,
      });
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
        console.log('[PrivacyVideoCall] 对方已准备好，立即开始媒体录制');
        startMediaRecording(stream);
        startMediaInfoReporting();
      } else {
        console.log('[PrivacyVideoCall] 等待对方媒体接收器就绪后再开始录制...');
      }
    } catch (error) {
      console.error('初始化本地媒体失败:', error);
      message.error('无法访问摄像头或麦克风');
      setIsLoading(false);
    }
  }, [friendId, isRemoteReceiverReady, sendMediaReady]);

  /**
   * 开始发送媒体数据
   * 只有在对方媒体接收器准备好后才能调用
   */
  const startSendingMedia = useCallback(() => {
    if (localStreamRef.current) {
      console.log('[PrivacyVideoCall] 开始发送媒体数据');
      startMediaRecording(localStreamRef.current);
      startMediaInfoReporting();
    }
  }, []);

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
    // 获取视频轨道
    const videoTrack = stream.getVideoTracks()[0];
    // 获取音频轨道
    const audioTrack = stream.getAudioTracks()[0];

    // 创建视频录制器
    if (videoTrack) {
      const videoStream = new MediaStream([videoTrack]);
      const videoRecorder = new MediaRecorder(videoStream, {
        mimeType: defaultMediaConfig.video_config.encode,
        videoBitsPerSecond: defaultMediaConfig.video_config.bitrate,
      });

      // 视频数据可用时发送给对方
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

      // 每50毫秒触发一次数据可用事件
      videoRecorder.start(50);
      mediaRecorderRef.current = videoRecorder;
    }

    // 创建音频录制器
    if (audioTrack) {
      const audioStream = new MediaStream([audioTrack]);
      const audioRecorder = new MediaRecorder(audioStream, {
        mimeType: defaultMediaConfig.audio_config.encode,
        audioBitsPerSecond: defaultMediaConfig.audio_config.bitrate,
      });

      // 音频数据可用时发送给对方
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

      // 每20毫秒触发一次数据可用事件
      audioRecorder.start(20);
      audioRecorderRef.current = audioRecorder;
    }
  };

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
    if (mediaSourceRef.current) {
      if (mediaSourceRef.current.readyState === 'open') {
        mediaSourceRef.current.endOfStream();
      }
      mediaSourceRef.current = null;
    }
    if (audioMediaSourceRef.current) {
      if (audioMediaSourceRef.current.readyState === 'open') {
        audioMediaSourceRef.current.endOfStream();
      }
      audioMediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
    audioSourceBufferRef.current = null;
    videoBufferQueueRef.current = [];
    audioBufferQueueRef.current = [];
    isVideoSourceBufferUpdatingRef.current = false;
    isAudioSourceBufferUpdatingRef.current = false;

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
          const data = new Uint8Array(event.payload);
          // 将数据添加到队列
          videoBufferQueueRef.current.push(data);
          // 尝试处理队列
          processVideoBufferQueue();
        }
      });

      // 监听音频帧数据
      const unlistenAudio = await listen<number[]>('audio_frame', (event) => {
        if (event.payload.length > 0) {
          const data = new Uint8Array(event.payload);
          audioBufferQueueRef.current.push(data);
          processAudioBufferQueue();
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
          // 开始初始化本地媒体
          initLocalMedia();
        },
      );

      // 监听对方拒绝通话
      const unlistenReject = await listen<string>(
        'video_call_reject',
        (event) => {
          console.log('对方拒绝了视频通话:', event.payload);
          setIsWaitingResponse(false);
          message.info('对方拒绝了视频通话');
          // 关闭视频通话
          handleEndCall();
        },
      );

      // 监听对方结束通话
      const unlistenEnd = await listen<string>('video_call_end', (event) => {
        console.log('对方结束了视频通话:', event.payload);
        message.info('对方已结束视频通话');
        // 关闭视频通话
        handleEndCall();
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
          console.log('[PrivacyVideoCall] 对方媒体接收器已就绪:', event.payload);
          setIsRemoteReceiverReady(true);
          // 对方准备好后，开始发送媒体数据
          startSendingMedia();
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
  }, [processVideoBufferQueue, processAudioBufferQueue, initLocalMedia, startSendingMedia]);

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
        // 对方结束了通话
        handleEndCall();
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
    const infoType = typeof info.info_type === 'string' ? info.info_type : (info.info_type as { Custom: string }).Custom;
    console.log(`[MediaInfo] 收到媒体信息: type=${infoType}, data=${info.data}`);

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
  const sendMediaInfo = useCallback(async (infoType: string, data: Record<string, unknown>) => {
    try {
      await invoke('send_p2p_media_info', {
        infoType,
        data: JSON.stringify(data),
        targetUuid: friendId,
      });
    } catch (error) {
      console.error('发送媒体信息失败:', error);
    }
  }, [friendId]);

  /**
   * 启动媒体信息定时发送
   * 每隔2秒通过MediaInfo通道发送一次帧率统计信息
   */
  const startMediaInfoReporting = useCallback(() => {
    if (mediaInfoIntervalRef.current) {
      clearInterval(mediaInfoIntervalRef.current);
    }

    mediaInfoIntervalRef.current = setInterval(() => {
      if (mediaState.isInCall) {
        sendMediaInfo('FrameRateStats', {
          frameRate: mediaInfoStatsRef.current.frameRate,
          videoBitrate: mediaInfoStatsRef.current.videoBitrate,
          audioBitrate: mediaInfoStatsRef.current.audioBitrate,
          latency: mediaInfoStatsRef.current.latency,
          droppedFrames: mediaInfoStatsRef.current.droppedFrames,
        });
      }
    }, 2000);
  }, [mediaState.isInCall, sendMediaInfo]);

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
  const handleEndCall = useCallback(async () => {
    // 停止媒体信息定时发送
    stopMediaInfoReporting();

    // 停止视频录制器
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    // 停止音频录制器
    if (
      audioRecorderRef.current &&
      audioRecorderRef.current.state !== 'inactive'
    ) {
      audioRecorderRef.current.stop();
    }

    // 停止所有媒体轨道
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

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

    // 发送结束通知给对方
    try {
      await invoke('send_p2p_video_call_end', {
        targetUuid: friendId,
      });
    } catch (error) {
      console.error('发送结束通知失败:', error);
    }

    // 更新状态
    setMediaState((prev) => ({ ...prev, isInCall: false }));

    // 调用关闭回调
    onClose?.();
  }, [friendId, onClose, stopMediaInfoReporting]);

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
    await handleEndCall();

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

    try {
      // 1. 停止当前的媒体录制器
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }

      // 2. 重置远程媒体接收器
      if (mediaSourceRef.current) {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
        mediaSourceRef.current = null;
      }
      if (audioMediaSourceRef.current) {
        if (audioMediaSourceRef.current.readyState === 'open') {
          audioMediaSourceRef.current.endOfStream();
        }
        audioMediaSourceRef.current = null;
      }
      sourceBufferRef.current = null;
      audioSourceBufferRef.current = null;
      videoBufferQueueRef.current = [];
      audioBufferQueueRef.current = [];
      isVideoSourceBufferUpdatingRef.current = false;
      isAudioSourceBufferUpdatingRef.current = false;

      // 3. 重新初始化远程媒体接收器
      await initRemoteMediaReceiver();

      // 4. 发送重新就绪信号
      await sendMediaReady();

      // 5. 重置状态
      setIsRemoteReceiverReady(false);

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
  }, [isRestarting, initRemoteMediaReceiver, sendMediaReady, isRemoteReceiverReady, startSendingMedia]);

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
      handleEndCall();
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
          // 接受邀请，开始初始化本地媒体
          await initLocalMedia();
        } else {
          // 拒绝邀请，关闭视频通话
          handleEndCall();
        }
      } catch (error) {
        console.error('发送视频通话响应失败:', error);
        message.error('发送视频通话响应失败');
        handleEndCall();
      }
    },
    [friendId, initLocalMedia, handleEndCall],
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
        await new Promise(resolve => setTimeout(resolve, 100));
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
        await initLocalMedia();
      }
    };

    init();

    // 组件真正卸载时清理资源并发送结束消息
    return () => {
      console.log('[PrivacyVideoCall] 组件卸载，发送结束消息');
      isMountedRef.current = false;
      handleEndCall();
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
            onClick={handleEndCall}
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
