import { invoke } from '@tauri-apps/api/core';
import { ChatSessionEvent, ChatSessionVo } from '@workspace/types';
import { useEffect, useState } from 'react';
import { useBackendEvent } from './useBackendEvent';

// 监听会话信息
const useChatsUnread = (recvUuid: string) => {
  const [chatSessions, setChatSessions] = useState<ChatSessionVo[]>([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);

  useEffect(() => {
    // 监听会话信息变化，更新会话数量
    let totalUnreadCount = 0;
    // 计算所有会话的未读消息总数
    chatSessions.forEach((session) => {
      totalUnreadCount += session.unread_count;
    });

    // 可以在这里使用totalUnreadCount进行其他操作，比如设置到状态中
    console.log('Total unread messages:', chatSessions);

    setTotalUnreadCount(totalUnreadCount);
  }, [recvUuid, chatSessions]);

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }

    const getChatSession = async () => {
      try {
        const res = (await invoke(
          'get_chat_session_from_store',
          {},
        )) as ChatSessionVo[];
        console.log('get_chat_session', res);
        setChatSessions(res);
      } catch (e) {
        console.log(e);
      }
    };

    // 初始获取会话数据
    getChatSession();

    // 添加一个定时任务，每30s检查一次会话信息
    const intervalId = setInterval(() => {
      getChatSession();
    }, 30000);

    return () => {
      if (intervalId) clearInterval(intervalId); // 组件卸载时清除定时器
    };
  }, [recvUuid]);

  useBackendEvent(
    'chat_session',
    (payload) => {
      // 监听会话信息
      try {
        const chatSessionEvent = JSON.parse(payload) as ChatSessionEvent;
        console.log('chatSessionEvent', chatSessionEvent);
        // 只监听当前用户的会话
        if (chatSessionEvent.data.recv_user !== recvUuid) {
          return;
        }
        // 更新会话信息
        setChatSessions((prev) => {
          const index = prev.findIndex(
            (item) =>
              item.send_user === chatSessionEvent.data.send_user &&
              item.recv_user === chatSessionEvent.data.recv_user,
          );
          if (index === -1) {
            return [...prev, chatSessionEvent.data];
          }
          if (chatSessionEvent.type === 0) {
            chatSessionEvent.data.unread_count = 0;
            const newChatSessions = [...prev];
            newChatSessions[index] = chatSessionEvent.data;
            return newChatSessions;
          } else if (chatSessionEvent.type === 1) {
            const newChatSessions = [...prev];
            chatSessionEvent.data.unread_count =
              chatSessionEvent.data.unread_count +
              newChatSessions[index].unread_count;
            newChatSessions[index] = chatSessionEvent.data;
            return newChatSessions;
          }
          return [...prev];
        });
      } catch (e) {
        console.log('接受信息错误', e);
      }
    },
    recvUuid !== '',
  );

  return { totalUnreadCount };
};

export { useChatsUnread };
