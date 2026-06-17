import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import React from 'react';
import styles from './styles/WebRTCMessage.less';

interface WebRTCMessageProps {
  textType: number;
  isMine: boolean;
}

const WebRTCMessage: React.FC<WebRTCMessageProps> = ({ textType, isMine }) => {
  const intl = useIntl();
  const getMessageInfo = () => {
    switch (textType) {
      case 5:
        return {
          icon: <VideoCameraOutlined />,
          text: isMine ? intl.formatMessage({ id: 'webRTCMessage.started' }) : intl.formatMessage({ id: 'webRTCMessage.otherStarted' }),
          type: 'video-call',
        };
      case 12:
        return {
          icon: <VideoCameraOutlined />,
          text: isMine ? intl.formatMessage({ id: 'webRTCMessage.inviteSent' }) : intl.formatMessage({ id: 'webRTCMessage.inviteReceived' }),
          type: 'invite',
        };
      case 13:
        return {
          icon: <CheckCircleOutlined />,
          text: intl.formatMessage({ id: 'webRTCMessage.accepted' }),
          type: 'accept',
        };
      case 14:
        return {
          icon: <CloseCircleOutlined />,
          text: intl.formatMessage({ id: 'webRTCMessage.rejected' }),
          type: 'reject',
        };
      case 15:
        return {
          icon: <PhoneOutlined />,
          text: intl.formatMessage({ id: 'webRTCMessage.ended' }),
          type: 'end',
        };
      case 100:
        return {
          icon: <VideoCameraOutlined />,
          text: intl.formatMessage({ id: 'webRTCMessage.signal' }),
          type: 'signal',
        };
      default:
        return {
          icon: <VideoCameraOutlined />,
          text: intl.formatMessage({ id: 'webRTCMessage.default' }),
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
