import { onNotifyChange } from '@/events/notifyRouter';
import { useBearStore } from '@/store/store';
import { getUnreadNotificationCounts } from '@workspace/services';
import { useEffect } from 'react';

// 监听系统通知
const useSystemNotify = (recvUuid: string) => {
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);

  /// 从 SQLite 查询各模块未读数量
  const refreshUnreadCounts = async () => {
    try {
      const counts = await getUnreadNotificationCounts();
      setMenuUnread({
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

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }
    refreshUnreadCounts();
    return onNotifyChange(() => refreshUnreadCounts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recvUuid]);
};

export { useSystemNotify };
