<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { BellOutlined, CheckOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { onNotifyChange } from '@/events/notifyRouter';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import {
  clearUnreadByLevel,
  getUnreadNotificationCounts,
} from '@workspace/services';
import type {
  NotificationCategoryKey,
  SystemNotification,
} from '@workspace/types';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    /** 传入时只展示该分类的通知(单类型模式), 不传则为通知中心全量模式 */
    type?: NotificationCategoryKey;
  }>(),
  {
    type: undefined,
    onClose: undefined,
  },
);

const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();
const store = useBearStore();

const notifications = ref<SystemNotification[]>([]);
const filter = ref<'all' | 'unread' | 'read'>('all');
const activeKey = ref<string>(props.type || 'all');

const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  '1-1-1': 'blue',
  '1-1-2': 'green',
  '1-3-1': 'orange',
  '1-3-2': 'cyan',
  '1-3-3': 'purple',
  '1-3-4': 'volcano',
  '1-4-1': 'magenta',
  '1-4-2': 'red',
  '1-5-1': 'gold',
  '1-5-2': 'geekblue',
};

const loadNotifications = async () => {
  try {
    const list = await invoke<SystemNotification[]>(
      'get_system_notification',
      { isRead: null },
    );
    notifications.value = list || [];
  } catch (e) {
    console.log('获取通知列表失败', e);
  }
};

const refreshUnreadCounts = async () => {
  const counts = await getUnreadNotificationCounts();
  store.setMenuUnread({
    ...store.menuUnread,
    contacts: counts.contacts,
    groups: counts.groups,
    plaza: counts.plaza,
    moments: counts.moments,
    total: counts.contacts + counts.groups + counts.plaza + counts.moments,
  });
};

let off: (() => void) | undefined;

const stopWatch = () => {
  off?.();
  off = undefined;
};

const startWatch = () => {
  stopWatch();
  if (!props.visible) return;
  loadNotifications();
  refreshUnreadCounts();
  off = onNotifyChange(() => {
    loadNotifications();
    refreshUnreadCounts();
  });
};

watch(() => props.visible, startWatch, { immediate: true });
onUnmounted(stopWatch);

const handleClearUnread = async (level1: number, level2: number) => {
  await clearUnreadByLevel(level1, level2, -1, -1);
  await refreshUnreadCounts();
  loadNotifications();
};

const handleMarkRead = async (id: string, isUnread: boolean) => {
  try {
    if (isUnread) {
      await invoke<number>('batch_read_system_notification', { readIds: [id] });
    }
    await refreshUnreadCounts();
    loadNotifications();
  } catch (e) {
    console.log('标记已读失败', e);
  }
};

const getFilteredNotifications = (level1: number, level2?: number) => {
  let list = notifications.value.filter((n) => n.level1 === level1);
  if (level2 !== undefined) {
    list = list.filter((n) => n.level2 === level2);
  }
  if (filter.value === 'unread') {
    list = list.filter((n) => n.is_read === false);
  } else if (filter.value === 'read') {
    list = list.filter((n) => n.is_read === true);
  }
  return list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1
        ? t('notification.justNow')
        : t('notification.minutesAgo', { minutes });
    }
    return t('notification.hoursAgo', { hours });
  }
  if (days === 1) return t('notification.yesterday');
  if (days < 7) return t('notification.daysAgo', { days });
  return date.toLocaleDateString();
};

const getNotificationType = (n: SystemNotification) => {
  const key = `${n.level1}-${n.level2}-${n.level3}`;
  const color = NOTIFICATION_TYPE_COLORS[key] || 'default';
  const typeKeyMap: Record<string, string> = {
    '1-1-1': 'notification.type.friendRequest',
    '1-1-2': 'notification.type.friendProcess',
    '1-3-1': 'notification.type.groupInvite',
    '1-3-2': 'notification.type.groupInfoUpdate',
    '1-3-3': 'notification.type.groupMemberChange',
    '1-3-4': 'notification.type.inviteResult',
    '1-4-1': 'notification.type.plazaLike',
    '1-4-2': 'notification.type.plazaMatch',
    '1-5-1': 'notification.type.momentLike',
    '1-5-2': 'notification.type.momentComment',
  };
  return {
    text: t(typeKeyMap[key] || 'notification.type.system'),
    color,
  };
};

const tabs = computed(() => {
  if (props.type) {
    const map: Record<
      NotificationCategoryKey,
      { level2: number; labelKey: string }
    > = {
      friend: { level2: 1, labelKey: 'notification.tab.friend' },
      group: { level2: 3, labelKey: 'notification.tab.group' },
      plaza: { level2: 4, labelKey: 'notification.tab.plaza' },
      moments: { level2: 5, labelKey: 'notification.tab.moments' },
    };
    const meta = map[props.type];
    if (!meta) return [];
    return [
      {
        key: props.type,
        label: t(meta.labelKey),
        level1: 1,
        level2: meta.level2,
        clearLevel2: meta.level2,
      },
    ];
  }
  return [
    {
      key: 'all',
      label: t('notification.tab.all'),
      level1: 1,
      level2: undefined,
      clearLevel2: -1,
    },
    {
      key: 'friend',
      label: t('notification.tab.friend'),
      level1: 1,
      level2: 1,
      clearLevel2: 1,
    },
    {
      key: 'group',
      label: t('notification.tab.group'),
      level1: 1,
      level2: 3,
      clearLevel2: 3,
    },
    {
      key: 'plaza',
      label: t('notification.tab.plaza'),
      level1: 1,
      level2: 4,
      clearLevel2: 4,
    },
    {
      key: 'moments',
      label: t('notification.tab.moments'),
      level1: 1,
      level2: 5,
      clearLevel2: 5,
    },
  ];
});

const activeTab = computed(
  () => tabs.value.find((tab) => tab.key === activeKey.value) ?? tabs.value[0],
);

const currentList = computed(() =>
  activeTab.value
    ? getFilteredNotifications(activeTab.value.level1, activeTab.value.level2)
    : [],
);

const unreadCount = computed(
  () => currentList.value.filter((n) => n.is_read === false).length,
);

const title = computed(() => {
  if (!props.type) return t('notification.title');
  const map: Record<NotificationCategoryKey, string> = {
    friend: 'notification.tab.friend',
    group: 'notification.tab.group',
    plaza: 'notification.tab.plaza',
    moments: 'notification.tab.moments',
  };
  return t(map[props.type]);
});

const close = () => emit('close');
</script>

<template>
  <a-modal
    :open="visible"
    :closable="false"
    :footer="null"
    :width="560"
    centered
    :class="styles.notificationPanel"
    @cancel="close"
  >
    <template #title>
      <div style="display: flex; align-items: center; gap: 8px">
        <BellOutlined />
        <span>{{ title }}</span>
      </div>
    </template>

    <div :class="styles.filterBar">
      <a-button
        :type="filter === 'all' ? 'primary' : 'default'"
        size="small"
        @click="filter = 'all'"
      >
        {{ t('notification.filter.all') }}
      </a-button>
      <a-button
        :type="filter === 'unread' ? 'primary' : 'default'"
        size="small"
        @click="filter = 'unread'"
      >
        {{ t('notification.filter.unread') }}
      </a-button>
      <a-button
        :type="filter === 'read' ? 'primary' : 'default'"
        size="small"
        @click="filter = 'read'"
      >
        {{ t('notification.filter.read') }}
      </a-button>
    </div>

    <a-tabs v-model:active-key="activeKey" :class="styles.tabs">
      <a-tab-pane v-for="tab in tabs" :key="tab.key" :tab="tab.label">
        <div>
          <div :class="styles.clearBar">
            <span :class="styles.unreadCount">
              <template v-if="unreadCount > 0">
                <a-badge :count="unreadCount" />
                <span>{{ t('notification.unreadCount') }}</span>
              </template>
            </span>
            <a-button
              type="link"
              size="small"
              @click="
                handleClearUnread(
                  tab.level1,
                  tab.clearLevel2 ?? tab.level2 ?? 0,
                )
              "
            >
              <template #icon><CheckOutlined /></template>
              {{ t('notification.clearUnread') }}
            </a-button>
          </div>

          <a-empty
            v-if="currentList.length === 0"
            :description="t('notification.noNotifications')"
          />
          <div v-else :class="styles.notifyList">
            <div
              v-for="n in currentList"
              :key="n.id"
              :class="[styles.notifyItem, n.is_read === false ? styles.unread : '']"
              @click="n.id && handleMarkRead(n.id, n.is_read === false)"
            >
              <div :class="styles.notifyHeader">
                <a-tag :color="getNotificationType(n).color">
                  {{ getNotificationType(n).text }}
                </a-tag>
                <span :class="styles.notifyTime">
                  {{ formatTime(n.created_at) }}
                </span>
                <span v-if="n.is_read === false" :class="styles.unreadDot" />
              </div>
              <div v-if="n.title" :class="styles.notifyTitle">{{ n.title }}</div>
              <div v-if="n.content" :class="styles.notifyContent">
                {{ n.content }}
              </div>
            </div>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </a-modal>
</template>
