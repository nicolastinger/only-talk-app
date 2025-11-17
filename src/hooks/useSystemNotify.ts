import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { SystemNotification } from '@/types/backend/system';
import { invoke } from '@tauri-apps/api/core';
import { useBearStore } from '@/store/store';

// 监听系统通知
const useSystemNotify = (uuid: string) => {
  const setMenuUnread = useBearStore((state) => state.setMenuUnread);

  useEffect(() => {
    if (!uuid) return;
    
    initSystemNotify();
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('listen_notify_msg', (event) => {
        try {
          const notify = JSON.parse(event.payload) as SystemNotification;
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
  }, [uuid]);

  /// 初始化系统通知，从后端获取所有未读的通知
  const initSystemNotify = async () => {
    try {
      let systemNotifications = await invoke('get_system_notification', { isRead: null }) as SystemNotification[];
      let contacts = 0;
      systemNotifications.forEach((notification) => {
        if (notification.level1 === 1) {
          contacts++;
        }
      });
      setMenuUnread({
        chats: 0,
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