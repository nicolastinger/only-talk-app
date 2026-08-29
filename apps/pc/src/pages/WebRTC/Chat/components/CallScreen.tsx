/**
 * 呼叫提示界面（来电/去电/被拒）
 */
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Spin } from 'antd';
import React from 'react';
import styles from '../index.less';

export type CallStage =
  | 'incoming'
  | 'outgoing'
  | 'connecting'
  | 'connected'
  | 'rejected'
  | 'ended';

interface CallScreenProps {
  callStage: CallStage;
  onAccept: () => void;
  onReject: () => void;
}
const CallScreen: React.FC<CallScreenProps> = ({
  callStage,
  onAccept,
  onReject,
}) => {
  const intl = useIntl();

  if (callStage === 'incoming') {
    return (
      <div className={styles.callScreen}>
        <div className={styles.callAvatar}>
          <VideoCameraOutlined />
        </div>
        <div className={styles.callTitle}>
          {intl.formatMessage({ id: 'webRTCMessage.inviteReceived' })}
        </div>
        <div className={styles.callActions}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            size="large"
            onClick={onAccept}
          >
            {intl.formatMessage({ id: 'webRTCMessage.acceptBtn' })}
          </Button>
          <Button
            danger
            icon={<CloseCircleOutlined />}
            size="large"
            onClick={onReject}
          >
            {intl.formatMessage({ id: 'webRTCMessage.rejectBtn' })}
          </Button>
        </div>
      </div>
    );
  }

  if (callStage === 'outgoing') {
    return (
      <div className={styles.callScreen}>
        <div className={styles.callAvatar}>
          <VideoCameraOutlined />
        </div>
        <div className={styles.callTitle}>
          {intl.formatMessage({ id: 'chat.footer.webRTCInviteSent' })}
        </div>
        <Spin />
      </div>
    );
  }

  // rejected
  return (
    <div className={styles.callScreen}>
      <div className={styles.callAvatar}>
        <VideoCameraOutlined />
      </div>
      <div className={styles.callTitle}>
        {intl.formatMessage({ id: 'webRTCMessage.rejected' })}
      </div>
    </div>
  );
};

export default CallScreen;
