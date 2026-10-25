/**
 * 视频面板：远端画面 / 头像占位 / 本地小窗 / 通话信息条 / 媒体控制条
 *
 * 现代化要点：
 * - 远端无画面（语音通话或对方关摄像头）时展示头像光晕占位，而非黑屏
 * - 顶部信息条常驻：好友名 + 连接状态 + 通话计时
 * - 底部悬浮胶囊控制条：麦克风 / 摄像头 / 挂断
 */
import { DEFAULT_ICON } from '@/constants';
import {
  AudioMutedOutlined,
  AudioOutlined,
  PhoneOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Tooltip } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from '../index.less';

interface VideoPanelProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isConnected: boolean;
  friendName?: string;
  friendAvatar?: string;
  callDurationText: string;
  statusText: string;
  /** 远端媒体流：用于监听视频轨 mute/unmute（对方开关摄像头） */
  remoteStream?: MediaStream | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onHangup: () => void;
}

const VideoPanel: React.FC<VideoPanelProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  isConnected,
  friendName,
  friendAvatar,
  callDurationText,
  statusText,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  onToggleVideo,
  onToggleAudio,
  onHangup,
}) => {
  const intl = useIntl();
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // 远端是否有画面：
  // - 语音通话没有视频轨，videoWidth 恒为 0
  // - 对方关摄像头时轨道会进入 muted，画面停在最后一帧，需要靠 mute/unmute 事件感知
  // 元素事件与轨道事件共同驱动，避免流先于 ref 挂载时状态不同步
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    const sync = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      if (track?.muted) {
        setHasRemoteVideo(false);
        return;
      }
      setHasRemoteVideo(video.readyState >= 2 && video.videoWidth > 0);
    };

    const track = remoteStream?.getVideoTracks()[0] ?? null;
    const onUnmute = () => {
      video.play().catch(() => {});
      sync();
    };
    const onMute = () => setHasRemoteVideo(false);

    sync();
    video.addEventListener('playing', sync);
    video.addEventListener('loadeddata', sync);
    video.addEventListener('resize', sync);
    video.addEventListener('emptied', sync);
    track?.addEventListener('mute', onMute);
    track?.addEventListener('unmute', onUnmute);
    return () => {
      video.removeEventListener('playing', sync);
      video.removeEventListener('loadeddata', sync);
      video.removeEventListener('resize', sync);
      video.removeEventListener('emptied', sync);
      track?.removeEventListener('mute', onMute);
      track?.removeEventListener('unmute', onUnmute);
    };
  }, [remoteStream, remoteVideoRef]);

  const avatar = friendAvatar || DEFAULT_ICON;

  return (
    <div className={styles.videoPanel}>
      <div className={styles.stageArea}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={styles.remoteVideo}
        />

        {!hasRemoteVideo && (
          <div className={styles.stagePlaceholder}>
            <div className={styles.stageAvatarHalo}>
              <span className={styles.stageAvatarRing} />
              <img className={styles.stageAvatar} src={avatar} alt="" />
            </div>
            <div className={styles.stageName}>
              {friendName || intl.formatMessage({ id: 'webrtc.videoChat' })}
            </div>
            <div className={styles.stageHint}>{statusText}</div>
          </div>
        )}

        <div className={styles.callInfoBar}>
          <span
            className={`${styles.infoDot} ${
              isConnected ? styles.infoDotLive : ''
            }`}
          />
          <span className={styles.infoName}>
            {friendName || intl.formatMessage({ id: 'webrtc.peer' })}
          </span>
          <span className={styles.infoDivider} />
          <span
            className={`${styles.infoTimer} ${
              isConnected ? styles.infoTimerLive : ''
            }`}
          >
            {isConnected ? callDurationText : statusText}
          </span>
        </div>

        {isVideoEnabled && (
          <div className={styles.localVideoContainer}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={styles.localVideo}
            />
            <span className={styles.localBadge}>
              {intl.formatMessage({ id: 'webrtc.local' })}
            </span>
            {!isAudioEnabled && (
              <span className={styles.localMutedBadge}>
                <AudioMutedOutlined />
              </span>
            )}
          </div>
        )}

        <div className={styles.controlDock}>
          <Tooltip
            title={intl.formatMessage({
              id: isAudioEnabled ? 'call.mute' : 'call.unmute',
            })}
          >
            <button
              type="button"
              className={`${styles.dockBtn} ${
                isAudioEnabled ? '' : styles.dockBtnOff
              }`}
              onClick={onToggleAudio}
            >
              {isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            </button>
          </Tooltip>
          <Tooltip
            title={intl.formatMessage({
              id: isVideoEnabled ? 'call.videoOff' : 'call.videoOn',
            })}
          >
            <button
              type="button"
              className={`${styles.dockBtn} ${
                isVideoEnabled ? '' : styles.dockBtnOff
              }`}
              onClick={onToggleVideo}
            >
              {isVideoEnabled ? (
                <VideoCameraOutlined />
              ) : (
                <VideoCameraAddOutlined />
              )}
            </button>
          </Tooltip>
          <button
            type="button"
            className={styles.hangupBtn}
            onClick={onHangup}
            title={intl.formatMessage({ id: 'call.hangup' })}
          >
            <PhoneOutlined rotate={135} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPanel;
