import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getUnreadNotificationCounts } from '@workspace/services';
import { SystemNotification } from '@workspace/types';
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

    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      unlisteners.push(
        await listen<string>('listen_notify_msg', (event) => {
          try {
            const notify = JSON.parse(event.payload) as SystemNotification;
            // 只处理当前用户的通知
            if (notify.user_id === recvUuid) {
              refreshUnreadCounts();
            }
          } catch (e) {
            console.log('解析通知消息失败', e);
          }
        }),
      );
      // 任意位置标记已读/清空未读后，刷新角标
      unlisteners.push(
        await listen('listen_notify_read', () => {
          refreshUnreadCounts();
        }),
      );
    };

    setupListeners().catch(console.error);

    return () => {
      unlisteners.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recvUuid]);
};

export { useSystemNotify };
