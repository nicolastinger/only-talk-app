/**
 * 视频面板：本地/远端视频 + 媒体控制按钮
 */
import {
  AudioMutedOutlined,
  AudioOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Tooltip } from 'antd';
import React from 'react';
import styles from '../index.less';

interface VideoPanelProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
}

const VideoPanel: React.FC<VideoPanelProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  localVideoRef,
  remoteVideoRef,
  onToggleVideo,
  onToggleAudio,
}) => {
  const intl = useIntl();

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
