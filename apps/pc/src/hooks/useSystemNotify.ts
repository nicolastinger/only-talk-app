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
        system: 0,
        settings: 0,
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

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('listen_notify_msg', (event) => {
        try {
          const notify = JSON.parse(event.payload) as SystemNotification;
          // 只处理当前用户的通知
          if (notify.user_id === recvUuid) {
            refreshUnreadCounts();
          }
        } catch (e) {
          console.log('解析通知消息失败', e);
        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recvUuid]);
};

export { useSystemNotify };
