import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { Dropdown, Tooltip } from 'antd';
import { useIntl } from '@umijs/max';
import { useState } from 'react';
import styles from './index.less';

interface OnlineStatus {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const OnlineStatusSwitch = () => {
  const intl = useIntl();

  const getOnlineStatuses = (): OnlineStatus[] => [
    {
      key: 'online',
      label: intl.formatMessage({ id: 'onlineStatus.online' }),
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      key: 'busy',
      label: intl.formatMessage({ id: 'onlineStatus.busy' }),
      icon: <MinusCircleOutlined />,
      color: '#ff4d4f',
    },
    {
      key: 'away',
      label: intl.formatMessage({ id: 'onlineStatus.away' }),
      icon: <ClockCircleOutlined />,
      color: '#faad14',
    },
    {
      key: 'invisible',
      label: intl.formatMessage({ id: 'onlineStatus.invisible' }),
      icon: <EyeInvisibleOutlined />,
      color: '#8c8c8c',
    },
  ];

  const [currentStatus, setCurrentStatus] = useState<OnlineStatus>(
    getOnlineStatuses()[0],
  );

  const handleStatusChange = (status: OnlineStatus) => {
    setCurrentStatus(status);
  };

  const items = getOnlineStatuses().map((status) => ({
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
      <Tooltip title={intl.formatMessage({ id: 'onlineStatus.title' })} placement="bottom">
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
