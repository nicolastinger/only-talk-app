/**
 * 视频区域：远程视频/音频 + 本地视频 + 等待/关闭遮罩
 */
import { VideoCameraOutlined } from '@ant-design/icons';
import React from 'react';

import styles from '../index.module.less';
import { CallPhase } from '../lib/callState';

interface VideoPanelProps {
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  isInCall: boolean;
  callPhase: CallPhase;
  videoEnabled: boolean;
}

const VideoPanel: React.FC<VideoPanelProps> = ({
  remoteVideoRef,
  remoteAudioRef,
  localVideoRef,
  isInCall,
  callPhase,
  videoEnabled,
}) => (
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
      {!isInCall && callPhase !== 'Calling' && callPhase !== 'Ringing' && (
        <div className={styles.waitingOverlay}>
          <span>等待对方连接...</span>
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
      {!videoEnabled && (
        <div className={styles.videoOffOverlay}>
          <VideoCameraOutlined style={{ fontSize: 32 }} />
        </div>
      )}
    </div>
  </div>
);

export default VideoPanel;
