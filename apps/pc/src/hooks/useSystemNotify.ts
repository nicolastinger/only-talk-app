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

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }

    initSystemNotify();
    let unlistenNotify: (() => void) | undefined;
    let unlistenUnread: (() => void) | undefined;

    const setupListener = async () => {
      // 监听完整通知数据（用于通知中心面板展示）
      unlistenNotify = await listen<string>('listen_notify_msg', (event) => {
        try {
          const notify = JSON.parse(event.payload) as SystemNotification;
          console.log('接收到系统通知', notify);
        } catch (e) {
          console.log('接受信息错误', e);
        }
      });

      // 监听未读数量更新（自动按模块分发）
      unlistenUnread = await listen<{ module: string; count: number }>(
        'listen_unread_count',
        (event) => {
          const { module, count } = event.payload;
          if (module === 'contacts') {
            setAddContacts(count);
          } else if (module === 'groups') {
            setAddGroups(count);
          }
          console.log('未读数量更新', module, count);
        },
      );
    };

    setupListener().catch(console.error);

    return () => {
      if (unlistenNotify) unlistenNotify();
      if (unlistenUnread) unlistenUnread();
    };
  }, [recvUuid]);

  /// 初始化系统通知，从后端获取所有未读的通知
  const initSystemNotify = async () => {
    try {
      let systemNotifications = (await invoke('get_system_notification', {
        isRead: 0,
      })) as SystemNotification[];
      let contacts = 0;
      let groups = 0;
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
          // 群聊模块通知
          if (notification.level2 === 3) {
            groups = (notification.unread_count || 0) + groups;
          }
        }
      });
      setMenuUnread({
        contacts,
        groups,
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
