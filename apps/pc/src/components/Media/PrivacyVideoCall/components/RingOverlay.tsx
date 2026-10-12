/**
 * 响铃/呼叫遮罩：发起方等待对方接听、被邀请方等待接听
 */
import { PhoneOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import React from 'react';

import { DEFAULT_ICON } from '@/constants';
import styles from '../index.module.less';

interface RingOverlayProps {
  friendAvatar: string;
  friendName: string;
  isWaitingResponse: boolean;
  onCancel: () => void;
}

const RingOverlay: React.FC<RingOverlayProps> = ({
  friendAvatar,
  friendName,
  isWaitingResponse,
  onCancel,
}) => (
  <div className={styles.ringOverlay}>
    <div className={styles.ringContent}>
      <div className={styles.ringAvatarWrap}>
        <img
          className={styles.ringAvatar}
          src={friendAvatar || DEFAULT_ICON}
          alt="avatar"
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
      </div>
      <div className={styles.ringName}>{friendName}</div>
      <div className={styles.ringStatus}>
        {isWaitingResponse ? '正在呼叫对方...' : '等待对方接听...'}
      </div>
      <div className={styles.ringActions}>
        <Tooltip title="取消通话">
          <Button
            type="primary"
            danger
            shape="circle"
            size="large"
            icon={<PhoneOutlined />}
            onClick={onCancel}
            className={styles.ringCancelBtn}
          />
        </Tooltip>
      </div>
    </div>
  </div>
);

export default RingOverlay;
