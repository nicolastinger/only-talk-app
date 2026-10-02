/**
 * 视频面板：本地/远端视频 + 媒体控制按钮
 */
import {
  AudioMutedOutlined,
  AudioOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { Button, Tooltip } from 'antd';
import React from 'react';
import styles from '../index.less';

interface VideoPanelProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  /** 远端连接状态: connecting 时远端视频流未就绪, 用对方头像覆盖 */
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'failed';
  /** 对方头像(远端流未就绪时覆盖显示) */
  friendAvatar?: string;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
}

const VideoPanel: React.FC<VideoPanelProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  connectionStatus,
  friendAvatar,
  localVideoRef,
  remoteVideoRef,
  onToggleVideo,
  onToggleAudio,
}) => {
  const intl = useIntl();
  // 远端视频流未就绪(connecting/failed/disconnected)时, 用对方头像覆盖
  const showRemotePlaceholder = connectionStatus !== 'connected';

  return (
    <div className={styles.videoPanel}>
      <div className={styles.videoWrapper}>
        <div className={styles.videoContainer}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={styles.remoteVideo}
          />
          {showRemotePlaceholder && (
            <div className={styles.remotePlaceholder}>
              <img
                src={friendAvatar || DEFAULT_ICON}
                alt="avatar"
                className={styles.remotePlaceholderImg}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_ICON;
                }}
              />
            </div>
          )}
          <div className={styles.videoLabel}>
            {intl.formatMessage({ id: 'webrtc.remote' })}
          </div>
        </div>
        <div className={styles.localVideoContainer}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={styles.localVideo}
          />
          <div className={styles.videoLabel}>
            {intl.formatMessage({ id: 'webrtc.local' })}
          </div>
        </div>
      </div>

      <div className={styles.mediaControls}>
        <Tooltip title={intl.formatMessage({ id: 'webrtc.closeCamera' })}>
          <Button
            type={isVideoEnabled ? 'primary' : 'default'}
            danger={!isVideoEnabled}
            icon={
              isVideoEnabled ? (
                <VideoCameraOutlined />
              ) : (
                <VideoCameraAddOutlined />
              )
            }
            onClick={onToggleVideo}
            size="large"
            shape="circle"
          />
        </Tooltip>
        <Tooltip title={intl.formatMessage({ id: 'webrtc.openCamera' })}>
          <Button
            type={isVideoEnabled ? 'primary' : 'default'}
            danger={!isVideoEnabled}
            icon={
              isVideoEnabled ? (
                <VideoCameraOutlined />
              ) : (
                <VideoCameraAddOutlined />
              )
            }
            onClick={onToggleVideo}
            size="large"
            shape="circle"
          />
        </Tooltip>
        <Tooltip title={intl.formatMessage({ id: 'webrtc.closeMicrophone' })}>
          <Button
            type={isAudioEnabled ? 'primary' : 'default'}
            danger={!isAudioEnabled}
            icon={isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={onToggleAudio}
            size="large"
            shape="circle"
          />
        </Tooltip>
        <Tooltip title={intl.formatMessage({ id: 'webrtc.openMicrophone' })}>
          <Button
            type={isAudioEnabled ? 'primary' : 'default'}
            danger={!isAudioEnabled}
            icon={isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={onToggleAudio}
            size="large"
            shape="circle"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default VideoPanel;
