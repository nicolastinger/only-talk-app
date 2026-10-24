/**
 * 手动状态标签(忙碌 / 离开 / 学习中 / 奋斗中 / 自定义)。
 *
 * 与在线离线无关: 没设置状态(或无状态/已过期)时不渲染任何内容。
 */
import { isPresenceExpired } from '@/store/presence';
import {
  ClockCircleOutlined,
  FireOutlined,
  MinusCircleOutlined,
  ReadOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { PresenceMode, PresenceVO } from '@workspace/types';
import React from 'react';
import styles from './index.less';

export interface PresenceMeta {
  icon: React.ReactNode;
  color: string;
  labelId: string;
}

/** 各状态的图标与主色(自定义状态走 text, 文案由 status.text 提供) */
export const PRESENCE_META: Record<
  Exclude<PresenceMode, 'online'>,
  PresenceMeta
> = {
  busy: {
    icon: <MinusCircleOutlined />,
    color: '#ff4d4f',
    labelId: 'onlineStatus.busy',
  },
  away: {
    icon: <ClockCircleOutlined />,
    color: '#faad14',
    labelId: 'onlineStatus.away',
  },
  studying: {
    icon: <ReadOutlined />,
    color: '#1890ff',
    labelId: 'onlineStatus.studying',
  },
  working: {
    icon: <FireOutlined />,
    color: '#fa8c16',
    labelId: 'onlineStatus.working',
  },
  custom: {
    icon: <SmileOutlined />,
    color: '#8c8c8c',
    labelId: 'onlineStatus.custom',
  },
};

interface PresenceTagProps {
  presence?: PresenceVO | null;
  /** 资料卡等大号场景用 default */
  size?: 'small' | 'default';
}

const PresenceTag: React.FC<PresenceTagProps> = ({
  presence,
  size = 'small',
}) => {
  const intl = useIntl();

  if (!presence || presence.mode === 'online' || isPresenceExpired(presence)) {
    return null;
  }

  const meta = PRESENCE_META[presence.mode] ?? PRESENCE_META.custom;
  const label =
    presence.mode === 'custom' && presence.text
      ? presence.text
      : intl.formatMessage({ id: meta.labelId });

  return (
    <span
      className={`${styles.tag} ${size === 'default' ? styles.tagDefault : ''}`}
      style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
      title={label}
    >
      <span className={styles.icon}>{meta.icon}</span>
      <span className={styles.text}>{label}</span>
    </span>
  );
};

export default PresenceTag;
