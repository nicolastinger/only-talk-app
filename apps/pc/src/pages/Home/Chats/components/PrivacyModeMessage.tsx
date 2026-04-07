import { LockOutlined } from '@ant-design/icons';
import React from 'react';
import styles from './styles/PrivacyModeMessage.less';

interface PrivacyModeMessageProps {
  isMine: boolean;
}

const PrivacyModeMessage: React.FC<PrivacyModeMessageProps> = ({ isMine }) => {
  return (
    <div className={`${styles.container} ${isMine ? styles.mine : styles.friend}`}>
      <div className={styles.iconWrapper}>
        <LockOutlined className={styles.icon} />
      </div>
      <div className={styles.text}>
        {isMine ? '已发起隐私模式' : '对方发起了隐私模式'}
      </div>
    </div>
  );
};

export default React.memo(PrivacyModeMessage);
