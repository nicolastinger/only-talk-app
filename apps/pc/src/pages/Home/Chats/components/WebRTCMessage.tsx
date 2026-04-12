import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import React from 'react';
import styles from './styles/WebRTCMessage.less';

interface WebRTCMessageProps {
  textType: number;
  isMine: boolean;
}

const WebRTCMessage: React.FC<WebRTCMessageProps> = ({ textType, isMine }) => {
  const getMessageInfo = () => {
    switch (textType) {
      case 5:
        return {
          icon: <VideoCameraOutlined />,
          text: isMine ? '已发起视频通话' : '对方发起了视频通话',
          type: 'video-call',
        };
      case 12:
        return {
          icon: <VideoCameraOutlined />,
          text: isMine ? '已发送视频通话邀请' : '收到视频通话邀请',
          type: 'invite',
        };
      case 13:
        return {
          icon: <CheckCircleOutlined />,
          text: '视频通话已接听',
          type: 'accept',
        };
      case 14:
        return {
          icon: <CloseCircleOutlined />,
          text: '视频通话已拒绝',
          type: 'reject',
        };
      case 15:
        return {
          icon: <PhoneOutlined />,
          text: '视频通话已结束',
          type: 'end',
        };
      case 100:
        return {
          icon: <VideoCameraOutlined />,
          text: 'WebRTC 信令消息',
          type: 'signal',
        };
      default:
        return {
          icon: <VideoCameraOutlined />,
          text: '视频通话',
          type: 'default',
        };
    }
  };

  const messageInfo = getMessageInfo();

  return (
    <div
      className={`${styles.container} ${styles[messageInfo.type]} ${
        isMine ? styles.mine : styles.friend
      }`}
    >
      <div className={styles.iconWrapper}>{messageInfo.icon}</div>
      <div className={styles.text}>{messageInfo.text}</div>
    </div>
  );
};

export default React.memo(WebRTCMessage);
