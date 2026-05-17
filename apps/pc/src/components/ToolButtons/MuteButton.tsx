import { SoundOutlined, StopOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useState } from 'react';
import styles from './MuteButton.less';

const MuteButton = () => {
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <Tooltip title={isMuted ? '取消静音' : '静音'} placement="bottom">
      <div
        className={`${styles.muteButton} ${isMuted ? styles.muted : ''}`}
        onClick={toggleMute}
      >
        {isMuted ? <StopOutlined /> : <SoundOutlined />}
      </div>
    </Tooltip>
  );
};

export default MuteButton;
