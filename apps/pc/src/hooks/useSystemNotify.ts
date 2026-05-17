import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SystemNotification } from '@workspace/types';
import { useEffect } from 'react';

// 监听系统通知
const useSystemNotify = (recvUuid: string) => {
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);
  const setAddContacts = useBearStore((state) => state.setAddContacts);
  const setAddGroups = useBearStore((state) => state.setAddGroups);
  const setAddSystem = useBearStore((state) => state.setAddSystem);
  const setAddSettings = useBearStore((state) => state.setAddSettings);

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }

    initSystemNotify();
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('listen_notify_msg', (event) => {
        try {
          const notify = JSON.parse(event.payload) as SystemNotification;
          // 只监听当前用户的通知
          if (notify.user_id !== recvUuid) {
            return;
          }
          // 系统通知
          if (notify.level1 === 1) {
            // 用户模块
            if (notify.level2 === 1) {
              setAddContacts(notify?.unread_count || 0);
            }
          }
          console.log('接受到系统通知', notify);
        } catch (e) {
          console.log('接受信息错误', e);
        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten(); // 组件卸载时取消订阅
    };
  }, [recvUuid]);

  /// 初始化系统通知，从后端获取所有未读的通知
  const initSystemNotify = async () => {
    try {
      let systemNotifications = (await invoke('get_system_notification', {
        isRead: 0,
      })) as SystemNotification[];
      let contacts = 0;
      systemNotifications.forEach((notification) => {
        // 只监听当前用户的通知
        if (notification.user_id !== recvUuid) {
          return;
        }
        // 来自本系统的通知
        if (notification.level1 === 1) {
          // 好友模块通知
          if (notification.level2 === 1) {
            contacts = (notification.unread_count || 0) + contacts;
          }
        }
      });
      setMenuUnread({
        contacts,
        groups: 0,
        system: 0,
        settings: 0,
      });
      console.log('systemNotifications', systemNotifications);
    } catch (e) {
      console.log('初始化通知信息错误', e);
    }
  };
};

export { useSystemNotify };
