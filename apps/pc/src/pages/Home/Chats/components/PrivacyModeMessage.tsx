import { LockOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import React from 'react';
import styles from './styles/PrivacyModeMessage.less';

interface PrivacyModeMessageProps {
  isMine: boolean;
}

const PrivacyModeMessage: React.FC<PrivacyModeMessageProps> = ({ isMine }) => {
  const intl = useIntl();
  return (
    <div
      className={`${styles.container} ${isMine ? styles.mine : styles.friend}`}
    >
      <div className={styles.iconWrapper}>
        <LockOutlined className={styles.icon} />
      </div>
      <div className={styles.text}>
        {isMine ? intl.formatMessage({ id: 'privacyModeMessage.started' }) : intl.formatMessage({ id: 'privacyModeMessage.otherStarted' })}
      </div>
    </div>
  );
};

export default React.memo(PrivacyModeMessage);
