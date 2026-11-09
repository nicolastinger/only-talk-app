import { onMounted, onUnmounted, watch } from 'vue';
import { onNotifyChange } from '@/events/notifyRouter';
import { useBearStore } from '@/stores/app';
import { getUnreadNotificationCounts } from '@workspace/services';

// 监听系统通知
export const useSystemNotify = (recvUuid: string | (() => string)) => {
  const getRecvUuid = () =>
    typeof recvUuid === 'function' ? recvUuid() : recvUuid;
  const store = useBearStore();
  let off: (() => void) | undefined;

  /// 从 SQLite 查询各模块未读数量
  const refreshUnreadCounts = async () => {
    try {
      const counts = await getUnreadNotificationCounts();
      store.setMenuUnread({
        contacts: counts.contacts,
        groups: counts.groups,
        plaza: counts.plaza,
        moments: counts.moments,
        system: 0,
        settings: 0,
        total:
          counts.contacts + counts.groups + counts.plaza + counts.moments,
      });
    } catch (e) {
      console.log('刷新未读通知数量失败', e);
    }
  };

  const start = () => {
    if (getRecvUuid() === '') return;
    refreshUnreadCounts();
    off?.();
    off = onNotifyChange(() => refreshUnreadCounts());
  };

  onMounted(start);
  watch(getRecvUuid, start);
  onUnmounted(() => off?.());
};
