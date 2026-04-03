import React from 'react';
import { AudioMutedOutlined, AudioOutlined, VideoCameraOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import styles from './VideoControls.module.less';

interface VideoControlsProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onEndCall: () => void;
}

const VideoControls: React.FC<VideoControlsProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  onToggleVideo,
  onToggleAudio,
  onEndCall,
}) => {
  return (
    <div className={styles.controlsContainer}>
      <Tooltip title={isVideoEnabled ? '关闭视频' : '开启视频'}>
        <Button
          className={`${styles.controlBtn} ${isVideoEnabled ? styles.activeBtn : styles.inactiveBtn}`}
          shape="circle"
          size="large"
          icon={isVideoEnabled ? <VideoCameraOutlined /> : <StopOutlined />}
          onClick={onToggleVideo}
        />
      </Tooltip>
      <Tooltip title={isAudioEnabled ? '静音' : '取消静音'}>
        <Button
          className={`${styles.controlBtn} ${isAudioEnabled ? styles.activeBtn : styles.inactiveBtn}`}
          shape="circle"
          size="large"
          icon={isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
          onClick={onToggleAudio}
        />
      </Tooltip>
      <Tooltip title="结束通话">
        <Button
          className={`${styles.controlBtn} ${styles.endCallBtn}`}
          shape="circle"
          size="large"
          icon={<StopOutlined />}
          onClick={onEndCall}
        />
      </Tooltip>
    </div>
  );
};

export default VideoControls;
