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
 *
 * 结构说明（Stage2 去上帝类后）：
 * - 组件仅负责编排：状态机、事件接线、UI 渲染
 * - 可变媒体/编解码状态集中在 `session`（lib/mediaSession.ts）
 * - 编解码逻辑拆分到 codec/videoEncoder|videoDecoder|audioEncoder|audioDecoder
 * - IPC 传输封装到 transport/p2pTransport，事件监听封装到 events/p2pEvents
 */
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { window } from '@tauri-apps/api';
import { get_user_info_with_cache } from '@workspace/services';
import {
  MediaControl,
  MediaControlState,
  MediaInfo,
  UserInfo,
  VideoCallInvite,
} from '@workspace/types';
import { message, Spin } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './index.module.less';

import * as audioDecoder from './codec/audioDecoder';
import * as audioEncoder from './codec/audioEncoder';
import * as videoDecoder from './codec/videoDecoder';
import * as videoEncoder from './codec/videoEncoder';
import CallControls from './components/CallControls';
import RingOverlay from './components/RingOverlay';
import VideoPanel from './components/VideoPanel';
import { registerP2pMediaChannels, registerP2pMediaEvents } from './events/p2pEvents';
import { CallPhase } from './lib/callState';
import { defaultMediaConfig, dlog, IS_WEBCODECS_SUPPORTED } from './lib/config';
import { createMediaSession, MediaSession } from './lib/mediaSession';
import * as transport from './transport/p2pTransport';

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

  // ==================== 媒体/编解码状态（MediaSession 集中承载） ====================

  /** 所有可变媒体/编解码状态槽位（编解码模块经此读写，见 lib/mediaSession.ts） */
  const sessionRef = useRef<MediaSession>(createMediaSession());
  const session = sessionRef.current;

  // ==================== 事件监听器清理引用 ====================

  /** 存储所有事件监听器的取消函数，用于组件卸载时清理 */
  const unlistenRef = useRef<(() => void)[]>([]);

  // ==================== 组件状态 ====================

  /**
   * 通话生命周期状态机
   * 统一管理此前分散的 isLoading / isConnected / isWaitingResponse /
   * isInCall / isRestarting / isCallEndedRef 等布尔状态，提升可读性与合法性
   */
  const [callPhase, setCallPhase] = useState<CallPhase>(
    isInitiator ? 'Idle' : 'Ringing',
  );

  /** 同步 ref，供事件监听器读取最新状态，避免闭包陷阱 */
  const callPhaseRef = useRef<CallPhase>(callPhase);

  /**
   * 状态机转换动作
   * 更新 React 状态并同步 ref，供事件监听器读取最新值
   *
   * @param next - 目标状态
   */
  const transition = useCallback((next: CallPhase) => {
    setCallPhase(next);
    callPhaseRef.current = next;
  }, []);

  /** 派生：发起方是否在呼叫中（等待对方接受） */
  const isWaitingResponse = callPhase === 'Calling';

  /** 派生：是否处于通话中（含重启） */
  const isInCall = callPhase === 'InCall' || callPhase === 'Restarting';

  /** 媒体控制状态 - 视频/音频开关状态 */
  const [mediaState, setMediaState] = useState<MediaControlState>({
    videoEnabled: true,
    audioEnabled: true,
    isPaused: false,
    isInCall: false,
  });

  /** 对方媒体接收器是否准备好 - 收到对方的media_ready信号后为true */
  const [isRemoteReceiverReady, setIsRemoteReceiverReady] = useState(false);

  // ==================== 好友信息（用于响铃/呼叫界面展示） ====================

  /** 对方用户信息（昵称、头像等） */
  const [friendUserInfo, setFriendUserInfo] = useState<UserInfo | null>(null);

  /** 加载对方用户信息（优先本地缓存，未命中再请求接口） */
  useEffect(() => {
    let cancelled = false;
    if (!friendId) return;
    (async () => {
      try {
        const result = await get_user_info_with_cache(friendId);
        if (!cancelled) {
          setFriendUserInfo(result.user_info);
        }
      } catch (error) {
        console.error('[PrivacyVideoCall] 获取对方用户信息失败:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  /** 对方头像地址（通过 avatarMap 将 icon bizId 转换为可显示的本地文件路径） */
  const { avatarMap } = useAvatarMap([friendUserInfo?.icon]);
  const friendAvatar = avatarMap.get(friendUserInfo?.icon || '') || '';

  /** 对方显示名称：优先邀请信息里的名字，其次用户信息昵称，最后兜底 */
  const friendName =
    inviteInfo?.from_name || friendUserInfo?.username || '对方';

  /** 派生：是否正在重启媒体接收器 */
  const isRestarting = callPhase === 'Restarting';

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
      await transport.sendP2pMediaReady(friendId);
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
      session.localStream = stream;

      // 将媒体流绑定到本地视频元素
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 发送媒体配置给对方
      await transport.sendP2pMediaConfig(
        friendId,
        JSON.stringify(defaultMediaConfig),
      );
      dlog('媒体配置已发送');

      // 更新状态：进入通话阶段
      transition('InCall');
      setMediaState((prev) => ({ ...prev, isInCall: true }));

      // 重要：发送媒体接收就绪信号，通知对方可以开始发送媒体数据
      // 这是解决视频黑屏问题的关键：确保双方都准备好后再开始传输
      await sendMediaReady();

      // 检查对方是否已经准备好，如果是，则开始录制
      if (isRemoteReceiverReady) {
        dlog('对方已准备好，1s 后开始媒体录制');
        // 统一走 startSendingMedia（含 1s 延迟），确保对端 receiver/decoder 完全就绪
        // 再开始编码发送，避免首条 config/keyframe 在对端未就绪时丢失导致黑屏
        startSendingMedia();
      } else {
        dlog('等待对方媒体接收器就绪后再开始录制...');
      }
    } catch (error) {
      console.error('初始化本地媒体失败:', error);
      message.error('无法访问摄像头或麦克风');
      transition('Ended');
    }
  }, [friendId, isRemoteReceiverReady, sendMediaReady, transition]);

  // 同步 ref，确保事件监听器始终调用最新版本
  initLocalMediaRef.current = initLocalMedia;

  /**
   * 开始发送媒体数据
   * 只有在对方媒体接收器准备好后才能调用
   */
  const startSendingMedia = useCallback(() => {
    if (!session.localStream) return;

    // 建立通话后延迟 1s 再开始采集发送视频/音频数据，
    // 确保对端媒体接收器已充分就绪（接收器注册、解码器配置等），
    // 避免首帧/配置帧在对端未就绪时丢失导致黑屏。
    if (session.mediaSendDelayTimer) {
      clearTimeout(session.mediaSendDelayTimer);
    }
    session.mediaSendDelayTimer = setTimeout(() => {
      console.log('[PrivacyVideoCall] 开始发送媒体数据');
      startMediaRecording(session.localStream!);
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
   * 2. 根据 WebCodecs 可用性选择编码器（WebCodecs / MediaRecorder 回退）
   * 3. 开始录制
   *
   * @param stream - 本地媒体流
   */
  const startMediaRecording = (stream: MediaStream) => {
    // 防止重复启动（initLocalMedia 与 media_receiver_ready 可能都会触发）
    if (session.isMediaSending) {
      dlog('媒体发送已启动，跳过重复启动');
      return;
    }
    session.isMediaSending = true;
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
      videoEncoder.startVideoWebCodecs(session, friendId, stream);
    } else if (videoTrack) {
      dlog('WebCodecs 不可用，视频回退到 MediaRecorder');
      videoEncoder.startVideoRecorder(session, friendId, stream);
    } else {
      dlog('无视频轨道，跳过视频发送');
    }

    // 音频：优先使用 WebCodecs Opus 实时编码，不支持时回退到 MediaRecorder
    if (audioTrack && IS_WEBCODECS_SUPPORTED) {
      audioEncoder.startAudioWebCodecs(session, friendId, stream);
    } else if (audioTrack) {
      dlog('WebCodecs 不可用，音频回退到 MediaRecorder');
      audioEncoder.startAudioRecorder(session, friendId, stream);
    } else {
      dlog('无音频轨道，跳过音频发送');
    }
  };

  // ==================== 初始化远程媒体接收器 ====================

  /**
   * 初始化远程媒体接收器
   * 视频走 WebCodecs 解码到画布 / MediaSource 回退，音频走 AudioContext / MediaSource 回退
   */
  const initRemoteMediaReceiver = useCallback(async () => {
    dlog(
      `初始化远程媒体接收器: 模式=${
        IS_WEBCODECS_SUPPORTED ? 'WebCodecs' : 'MediaSource(旧)'
      }`,
    );
    videoDecoder.initVideoReceiver(session, remoteVideoRef.current);
    audioDecoder.initAudioReceiver(session, remoteAudioRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // ==================== 第一步：注册媒体 Channel 与事件监听器 ====================
      // 视频/音频帧通过 Channel 二进制直传（避免 JSON number[] 序列化），
      // 其他信令（媒体控制/接受/拒绝/结束/媒体信息/就绪）继续走事件监听。
      // 必须在任何信令之前完成，避免视频帧到达时监听器未就绪。
      const channelUnlisten = await registerP2pMediaChannels(friendId, {
        onVideoFrame: (frameData) => {
          if (IS_WEBCODECS_SUPPORTED) {
            videoDecoder.handleWebCodecsVideoFrame(session, friendId, frameData);
          } else {
            session.videoBufferQueue.push(frameData);
            videoDecoder.processVideoBufferQueue(session);
          }
        },
        onAudioFrame: (frameData) => {
          if (session.audioWebCodecsActive) {
            audioDecoder.handleWebCodecsAudioFrame(session, frameData);
          } else {
            session.audioBufferQueue.push(frameData);
            audioDecoder.processAudioBufferQueue(session);
          }
        },
      });

      unlistenRef.current = await registerP2pMediaEvents({
        onMediaControl: handleMediaControl,
        onVideoCallAccept: (payload) => {
          console.log('对方接受了视频通话:', payload);
          transition('Connecting');
          message.success('对方已接受视频通话');
          // 通过 ref 调用最新版本的 initLocalMedia，避免闭包陷阱
          initLocalMediaRef.current();
        },
        onVideoCallReject: (payload) => {
          console.log('对方拒绝了视频通话:', payload);
          message.info('对方拒绝了视频通话');
          // 关闭视频通话（本方主动结束，通知对方）
          handleEndCall(true);
        },
        onVideoCallEnd: (payload) => {
          console.log('对方结束了视频通话:', payload);
          message.info('对方已结束视频通话');
          // 对方已结束，本方不需要再发送结束通知，仅做本地清理
          handleEndCall(false);
        },
        onMediaInfo: handleMediaInfo,
        onMediaReady: (payload) => {
          dlog('对方媒体接收器已就绪:', payload);
          setIsRemoteReceiverReady(true);
          // 对方可能刚重启了接收器，立即请求关键帧并重发解码器配置，加速恢复
          if (IS_WEBCODECS_SUPPORTED) {
            session.requestKeyframe = true;
            if (session.lastSentVideoConfig) {
              dlog('对方已就绪，重发视频解码器配置');
              videoEncoder.sendVideoDecoderConfig(
                session,
                friendId,
                session.lastSentVideoConfig,
              );
            }
            if (session.lastSentAudioConfig) {
              dlog('对方已就绪，重发音频解码器配置');
              audioEncoder.sendAudioDecoderConfig(
                session,
                friendId,
                session.lastSentAudioConfig,
              );
            }
          }
          // 通过 ref 调用最新版本的 startSendingMedia
          startSendingMediaRef.current();
        },
      });

      // 合并 Channel 取消函数与事件监听取消函数
      unlistenRef.current = [...channelUnlisten, ...unlistenRef.current];

      console.log('[PrivacyVideoCall] 所有媒体Channel与事件监听器已注册完成');
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
    // codec 处理函数已收敛到模块（稳定引用），因此依赖为空数组。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        await transport.sendP2pMediaInfo(
          friendId,
          infoType,
          JSON.stringify(data),
        );
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
    if (session.mediaInfoInterval) {
      clearInterval(session.mediaInfoInterval);
    }
    session.mediaStartTime = Date.now();

    session.mediaInfoInterval = setInterval(() => {
      if (mediaState.isInCall) {
        sendMediaInfo('FrameRateStats', {
          frameRate: session.mediaInfoStats.frameRate,
          videoBitrate: session.mediaInfoStats.videoBitrate,
          audioBitrate: session.mediaInfoStats.audioBitrate,
          latency: session.mediaInfoStats.latency,
          droppedFrames: session.mediaInfoStats.droppedFrames,
        });

        // 周期性状态诊断
        dlog(
          `状态: 视频编码器=${session.videoEncoder?.state ?? 'none'}(${
            session.videoEncoder?.encodeQueueSize ?? 0
          }) 视频解码器=${session.videoDecoder?.state ?? 'none'}(${
            session.videoDecoder?.decodeQueueSize ?? 0
          }) 音频编码器=${session.audioEncoder?.state ?? 'none'}(${
            session.audioEncoder?.encodeQueueSize ?? 0
          }) 音频解码器=${session.audioDecoder?.state ?? 'none'}(${
            session.audioDecoder?.decodeQueueSize ?? 0
          }) 对方就绪=${isRemoteReceiverReady} AudioContext=${
            session.audioContext?.state ?? 'none'
          } 已收首关键帧=${session.videoFirstKeyframeReceived} 缓冲帧=${
            session.pendingVideoFrames.length
          }`,
        );

        // 黑屏看门狗：通话进行超过 4 秒仍未收到首个关键帧，
        // 说明配置帧/关键帧可能丢失。向对端重新发送 media_ready 信号，
        // 让对端的 media_receiver_ready 监听器重发解码器配置并请求关键帧恢复。
        // 去掉 videoDecoderRef 非空的限制：收不到 config 时解码器恰好为 null，
        // 更需要在此时反向触发恢复。限速 3s，避免每 2s 刷屏。
        if (
          IS_WEBCODECS_SUPPORTED &&
          Date.now() - session.mediaStartTime > 4000 &&
          !session.videoFirstKeyframeReceived
        ) {
          const now = Date.now();
          if (
            !session.lastRecoverySignal ||
            now - session.lastRecoverySignal > 3000
          ) {
            session.lastRecoverySignal = now;
            dlog(
              '⚠️ 4秒未收到视频关键帧，向对端重新发送 media_ready 请求补发 config + 关键帧',
            );
            sendMediaReady();
          }
        }
      }
    }, 2000);
  }, [
    mediaState.isInCall,
    sendMediaInfo,
    isRemoteReceiverReady,
    sendMediaReady,
  ]);

  /**
   * 停止媒体信息定时发送
   */
  const stopMediaInfoReporting = useCallback(() => {
    if (session.mediaInfoInterval) {
      clearInterval(session.mediaInfoInterval);
      session.mediaInfoInterval = null;
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
    if (session.localStream) {
      const videoTrack = session.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = newState;
      }
    }

    // 发送控制命令给对方
    await transport.sendP2pMediaControl(friendId, 'VideoToggle', newState);
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
    if (session.localStream) {
      const audioTrack = session.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = newState;
      }
    }

    // 发送控制命令给对方
    await transport.sendP2pMediaControl(friendId, 'AudioToggle', newState);
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
      // 状态机：进入结束阶段（终结态，不再接受其他转换）
      transition('Ended');
      dlog(
        `结束通话: 通知对方=${notifyOtherParty} 视频编码器=${
          session.videoEncoder ? '运行中' : '无'
        } 视频解码器=${session.videoDecoder ? '运行中' : '无'} 音频编码器=${
          session.audioEncoder ? '运行中' : '无'
        } 音频解码器=${session.audioDecoder ? '运行中' : '无'}`,
      );

      // 停止媒体信息定时发送
      stopMediaInfoReporting();

      // 停止视频录制器
      if (session.mediaRecorder && session.mediaRecorder.state !== 'inactive') {
        session.mediaRecorder.stop();
      }
      session.mediaRecorder = null;

      // 停止音频录制器
      if (session.audioRecorder && session.audioRecorder.state !== 'inactive') {
        session.audioRecorder.stop();
      }
      session.audioRecorder = null;

      // 停止 WebCodecs 视频编码器
      if (session.videoEncoder) {
        try {
          session.videoEncoder.close();
        } catch (e) {
          console.error('关闭视频编码器失败:', e);
        }
        session.videoEncoder = null;
      }

      // 停止视频轨道处理器（读取循环随之结束）
      if (session.videoReader) {
        try {
          // 取消 reader 会打断挂起的 read() 并使流解锁，避免 "Cannot cancel a locked stream"
          await session.videoReader.cancel();
        } catch (e) {
          console.error('取消视频轨道读取失败:', e);
        }
        session.videoReader = null;
      }
      session.videoTrackProcessor = null;

      // 停止 WebCodecs 音频编码器
      if (session.audioEncoder) {
        try {
          session.audioEncoder.close();
        } catch (e) {
          console.error('关闭音频编码器失败:', e);
        }
        session.audioEncoder = null;
      }

      // 停止音频轨道处理器
      if (session.audioReader) {
        try {
          await session.audioReader.cancel();
        } catch (e) {
          console.error('取消音频轨道读取失败:', e);
        }
        session.audioReader = null;
      }
      session.audioTrackProcessor = null;
      session.lastSentAudioConfig = null;

      // 停止周期关键帧定时器
      if (session.keyframeTimer) {
        clearInterval(session.keyframeTimer);
        session.keyframeTimer = null;
      }
      session.requestKeyframe = false;

      // 清除媒体延迟发送定时器（通话已结束，不再延迟启动）
      if (session.mediaSendDelayTimer) {
        clearTimeout(session.mediaSendDelayTimer);
        session.mediaSendDelayTimer = null;
      }

      // 停止所有媒体轨道并释放硬件设备（摄像头/麦克风）
      if (session.localStream) {
        session.localStream.getTracks().forEach((track) => track.stop());
        session.localStream = null;
      }

      // 关闭 WebCodecs 视频解码器
      if (session.videoDecoder) {
        try {
          session.videoDecoder.close();
        } catch (e) {
          console.error('关闭视频解码器失败:', e);
        }
        session.videoDecoder = null;
      }
      session.decodedVideoConfig = null;
      session.pendingVideoFrames = [];
      session.videoFirstKeyframeReceived = false;

      // 关闭 WebCodecs 音频解码器
      if (session.audioDecoder) {
        try {
          session.audioDecoder.close();
        } catch (e) {
          console.error('关闭音频解码器失败:', e);
        }
        session.audioDecoder = null;
      }
      session.decodedAudioConfig = null;

      // 关闭音频输出 AudioContext
      if (session.audioContext) {
        try {
          session.audioContext.close();
        } catch (e) {
          console.error('关闭 AudioContext 失败:', e);
        }
        session.audioContext = null;
      }
      session.audioPlayTime = 0;
      session.audioWebCodecsActive = false;

      // 释放远程视频画布捕获流
      if (session.remoteCanvasStream) {
        session.remoteCanvasStream.getTracks().forEach((track) => track.stop());
        session.remoteCanvasStream = null;
      }
      session.videoCanvasCtx = null;

      // 关闭视频 MediaSource 并清理引用
      if (session.mediaSource) {
        if (session.mediaSource.readyState === 'open') {
          session.mediaSource.endOfStream();
        }
        session.mediaSource = null;
      }
      session.sourceBuffer = null;
      session.videoBufferQueue = [];
      session.isVideoSourceBufferUpdating = false;

      // 关闭音频 MediaSource 并清理引用
      if (session.audioMediaSource) {
        if (session.audioMediaSource.readyState === 'open') {
          session.audioMediaSource.endOfStream();
        }
        session.audioMediaSource = null;
      }
      session.audioSourceBuffer = null;
      session.audioBufferQueue = [];
      session.isAudioSourceBufferUpdating = false;

      // 仅当本方主动结束时才发送结束通知给对方
      // 收到对方结束消息时不需要再回复，避免互相发送结束消息
      if (notifyOtherParty) {
        try {
          await transport.sendP2pVideoCallEnd(friendId);
        } catch (error) {
          console.error('发送结束通知失败:', error);
        }
      }

      // 更新状态
      setMediaState((prev) => ({ ...prev, isInCall: false }));

      // 重置媒体发送标记，允许下次通话重新启动
      session.isMediaSending = false;

      // 调用关闭回调
      onClose?.();
    },
    [friendId, onClose, stopMediaInfoReporting, transition],
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
      await transport.closeP2pConnection(friendId);
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

    transition('Restarting');
    console.log('[PrivacyVideoCall] 开始重启媒体接收器...');
    dlog('开始重启媒体接收器');

    try {
      // 1. 停止当前的媒体录制器
      if (session.mediaRecorder && session.mediaRecorder.state !== 'inactive') {
        session.mediaRecorder.stop();
        session.mediaRecorder = null;
      }
      if (session.audioRecorder && session.audioRecorder.state !== 'inactive') {
        session.audioRecorder.stop();
        session.audioRecorder = null;
      }

      // 1.1 停止 WebCodecs 视频编码器
      if (session.videoEncoder) {
        try {
          session.videoEncoder.close();
        } catch (e) {
          console.error('关闭视频编码器失败:', e);
        }
        session.videoEncoder = null;
      }
      if (session.videoReader) {
        try {
          await session.videoReader.cancel();
        } catch (e) {
          console.error('取消视频轨道读取失败:', e);
        }
        session.videoReader = null;
      }
      session.videoTrackProcessor = null;
      if (session.keyframeTimer) {
        clearInterval(session.keyframeTimer);
        session.keyframeTimer = null;
      }
      // 清除媒体延迟发送定时器（重启后会重新设置）
      if (session.mediaSendDelayTimer) {
        clearTimeout(session.mediaSendDelayTimer);
        session.mediaSendDelayTimer = null;
      }

      // 1.2 停止 WebCodecs 音频编码器
      if (session.audioEncoder) {
        try {
          session.audioEncoder.close();
        } catch (e) {
          console.error('关闭音频编码器失败:', e);
        }
        session.audioEncoder = null;
      }
      if (session.audioReader) {
        try {
          await session.audioReader.cancel();
        } catch (e) {
          console.error('取消音频轨道读取失败:', e);
        }
        session.audioReader = null;
      }
      session.audioTrackProcessor = null;
      session.lastSentAudioConfig = null;

      // 2. 重置远程媒体接收器
      if (IS_WEBCODECS_SUPPORTED) {
        // 重置 WebCodecs 视频解码器与画布捕获流
        if (session.videoDecoder) {
          try {
            session.videoDecoder.close();
          } catch (e) {
            console.error('关闭视频解码器失败:', e);
          }
          session.videoDecoder = null;
        }
        session.decodedVideoConfig = null;
        session.pendingVideoFrames = [];
        session.videoFirstKeyframeReceived = false;
        // 重置 WebCodecs 音频解码器
        if (session.audioDecoder) {
          try {
            session.audioDecoder.close();
          } catch (e) {
            console.error('关闭音频解码器失败:', e);
          }
          session.audioDecoder = null;
        }
        session.decodedAudioConfig = null;
        session.audioPlayTime = 0;
        if (session.remoteCanvasStream) {
          session.remoteCanvasStream
            .getTracks()
            .forEach((track) => track.stop());
          session.remoteCanvasStream = null;
        }
        session.videoCanvas = null;
        session.videoCanvasCtx = null;
      } else {
        if (session.mediaSource) {
          if (session.mediaSource.readyState === 'open') {
            session.mediaSource.endOfStream();
          }
          session.mediaSource = null;
        }
        session.sourceBuffer = null;
        session.videoBufferQueue = [];
        session.isVideoSourceBufferUpdating = false;
      }

      if (session.audioMediaSource) {
        if (session.audioMediaSource.readyState === 'open') {
          session.audioMediaSource.endOfStream();
        }
        session.audioMediaSource = null;
      }
      session.audioSourceBuffer = null;
      session.audioBufferQueue = [];
      session.isAudioSourceBufferUpdating = false;

      // 3. 重新初始化远程媒体接收器
      await initRemoteMediaReceiver();

      // 4. 发送重新就绪信号
      await sendMediaReady();

      // 5. 重置状态
      setIsRemoteReceiverReady(false);

      // 允许重新启动媒体发送
      session.isMediaSending = false;

      // 6. 如果本地媒体流存在，重新开始发送
      if (session.localStream && isRemoteReceiverReady) {
        startSendingMedia();
      }

      console.log('[PrivacyVideoCall] 媒体接收器重启完成');
      message.success('媒体接收器已重启');
    } catch (error) {
      console.error('重启媒体接收器失败:', error);
      message.error('重启媒体接收器失败');
    } finally {
      // 状态机：恢复通话阶段（仅当未结束通话时）
      if (!isCallEndedRef.current) {
        transition('InCall');
      }
    }
  }, [
    isRestarting,
    initRemoteMediaReceiver,
    sendMediaReady,
    isRemoteReceiverReady,
    startSendingMedia,
    transition,
  ]);

  // ==================== 发送视频通话邀请 ====================

  /**
   * 发送视频通话邀请
   * 仅发起方调用
   */
  const sendVideoCallInvite = useCallback(async () => {
    try {
      await transport.sendP2pVideoCallInvite(friendId, null);
      transition('Calling');
    } catch (error) {
      console.error('发送视频通话邀请失败:', error);
      message.error('发送视频通话邀请失败');
      handleEndCall(true);
    }
  }, [friendId, handleEndCall, transition]);

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
        await transport.sendP2pVideoCallResponse(friendId, {
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
      {/* 响铃/呼叫遮罩 - 等待对方接听 */}
      {(callPhase === 'Calling' || callPhase === 'Ringing') && (
        <RingOverlay
          friendAvatar={friendAvatar}
          friendName={friendName}
          isWaitingResponse={isWaitingResponse}
          onCancel={() => handleEndCall(true)}
        />
      )}

      {/* 加载状态遮罩 - 建立连接中 */}
      {callPhase === 'Connecting' && (
        <div className={styles.loadingOverlay}>
          <Spin size="large" tip="正在建立视频连接..." />
        </div>
      )}

      {/* 视频区域 */}
      <VideoPanel
        remoteVideoRef={remoteVideoRef}
        remoteAudioRef={remoteAudioRef}
        localVideoRef={localVideoRef}
        isInCall={isInCall}
        callPhase={callPhase}
        videoEnabled={mediaState.videoEnabled}
      />

      {/* 控制按钮区域 */}
      <CallControls
        mediaState={mediaState}
        isRestarting={isRestarting}
        isInCall={isInCall}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onRestart={handleRestartMedia}
        onEnd={() => handleEndCall(true)}
        onExit={handleExit}
      />
    </div>
  );
};

// 使用 React.memo 优化性能，避免不必要的重新渲染
export default React.memo(PrivacyVideoCall);
