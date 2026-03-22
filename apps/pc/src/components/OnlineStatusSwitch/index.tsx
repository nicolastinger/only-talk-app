import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { Dropdown, Tooltip } from 'antd';
import { useState } from 'react';
import styles from './index.less';

interface OnlineStatus {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const ONLINE_STATUSES: OnlineStatus[] = [
  {
    key: 'online',
    label: '在线',
    icon: <CheckCircleOutlined />,
    color: '#52c41a',
  },
  {
    key: 'busy',
    label: '忙碌',
    icon: <MinusCircleOutlined />,
    color: '#ff4d4f',
  },
  {
    key: 'away',
    label: '离开',
    icon: <ClockCircleOutlined />,
    color: '#faad14',
  },
  {
    key: 'invisible',
    label: '隐身',
    icon: <EyeInvisibleOutlined />,
    color: '#8c8c8c',
  },
];

const OnlineStatusSwitch = () => {
  const [currentStatus, setCurrentStatus] = useState<OnlineStatus>(
    ONLINE_STATUSES[0],
  );

  const handleStatusChange = (status: OnlineStatus) => {
    setCurrentStatus(status);
  };

  const items = ONLINE_STATUSES.map((status) => ({
    key: status.key,
    label: (
      <div
        className={styles.statusItem}
        onClick={() => handleStatusChange(status)}
      >
        <span className={styles.statusIcon} style={{ color: status.color }}>
          {status.icon}
        </span>
        <span className={styles.statusLabel}>{status.label}</span>
      </div>
    ),
  }));

  return (
    <Dropdown menu={{ items }} placement="bottomLeft" trigger={['click']}>
      <Tooltip title="在线状态" placement="bottom">
        <div className={styles.statusSwitch}>
          <span
            className={styles.statusIcon}
            style={{ color: currentStatus.color }}
          >
            {currentStatus.icon}
          </span>
          <span className={styles.statusLabel}>{currentStatus.label}</span>
        </div>
      </Tooltip>
    </Dropdown>
  );
};

export default OnlineStatusSwitch;
