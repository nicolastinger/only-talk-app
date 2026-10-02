/**
 * 呼叫提示界面（来电/去电/被拒）
 */
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { DEFAULT_ICON } from '@/constants';
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
  /** 对方头像(未接听阶段覆盖远端视频区); 未取到用默认图标兜底 */
  avatar?: string;
  onAccept: () => void;
  onReject: () => void;
}
const CallScreen: React.FC<CallScreenProps> = ({
  callStage,
  avatar,
  onAccept,
  onReject,
}) => {
  const intl = useIntl();

  const renderAvatar = () => (
    <div className={styles.callAvatar}>
      <img
        src={avatar || DEFAULT_ICON}
        alt="avatar"
        className={styles.callAvatarImg}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEFAULT_ICON;
        }}
      />
    </div>
  );

  if (callStage === 'incoming') {
    return (
      <div className={styles.callScreen}>
        {renderAvatar()}
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
        {renderAvatar()}
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
      {renderAvatar()}
      <div className={styles.callTitle}>
        {intl.formatMessage({ id: 'webRTCMessage.rejected' })}
      </div>
    </div>
  );
};

export default CallScreen;
