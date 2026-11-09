import type { Component } from 'vue';
import {
  ClockCircleOutlined,
  FireOutlined,
  MinusCircleOutlined,
  ReadOutlined,
  SmileOutlined,
} from '@ant-design/icons-vue';
import type { PresenceMode } from '@workspace/types';

export interface PresenceMeta {
  icon: Component;
  color: string;
  labelId: string;
}

/** 各状态的图标与主色(自定义状态走 text, 文案由 status.text 提供) */
export const PRESENCE_META: Record<
  Exclude<PresenceMode, 'online'>,
  PresenceMeta
> = {
  busy: {
    icon: MinusCircleOutlined,
    color: '#ff4d4f',
    labelId: 'onlineStatus.busy',
  },
  away: {
    icon: ClockCircleOutlined,
    color: '#faad14',
    labelId: 'onlineStatus.away',
  },
  studying: {
    icon: ReadOutlined,
    color: '#1890ff',
    labelId: 'onlineStatus.studying',
  },
  working: {
    icon: FireOutlined,
    color: '#fa8c16',
    labelId: 'onlineStatus.working',
  },
  custom: {
    icon: SmileOutlined,
    color: '#8c8c8c',
    labelId: 'onlineStatus.custom',
  },
};
