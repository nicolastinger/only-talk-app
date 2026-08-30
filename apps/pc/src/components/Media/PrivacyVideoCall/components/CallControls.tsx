/**
 * 控制按钮区域：音频/视频开关、重启媒体、结束通话、退出
 */
import {
  AudioMutedOutlined,
  AudioOutlined,
  LogoutOutlined,
  PhoneOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { MediaControlState } from '@workspace/types';
import { Button, Tooltip } from 'antd';
import React from 'react';

import styles from '../index.module.less';

interface CallControlsProps {
  mediaState: MediaControlState;
  isRestarting: boolean;
  isInCall: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onRestart: () => void;
  onEnd: () => void;
  onExit: () => void;
}

const CallControls: React.FC<CallControlsProps> = ({
  mediaState,
  isRestarting,
  isInCall,
  onToggleAudio,
  onToggleVideo,
  onRestart,
  onEnd,
  onExit,
}) => (
  <div className={styles.controls}>
    {/* 音频开关按钮 */}
    <Tooltip title={mediaState.audioEnabled ? '关闭麦克风' : '开启麦克风'}>
      <Button
        type={mediaState.audioEnabled ? 'primary' : 'default'}
        shape="circle"
        size="large"
        icon={
          mediaState.audioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />
        }
        onClick={onToggleAudio}
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
        onClick={onToggleVideo}
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
        onClick={onRestart}
        disabled={isRestarting || !isInCall}
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
        onClick={onEnd}
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
        onClick={onExit}
        className={styles.exitButton}
      />
    </Tooltip>
  </div>
);

export default CallControls;
