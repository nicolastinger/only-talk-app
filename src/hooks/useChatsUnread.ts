import { ChatSessionEvent, ChatSessionVo } from '@/types/backend/vo';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

// 监听会话信息
const useChatsUnread = (recvUuid: string) => {
  const [chatSessions, setChatSessions] = useState<ChatSessionVo[]>([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);

  useEffect(() => {
    // 监听会话信息变化，更新会话数量
    // 过滤出有未读消息的会话
    const unreadSessions = chatSessions.filter((item) => item.unread_count > 0);
    
    // 计算所有会话的未读消息总数
    const totalUnreadCount = unreadSessions.reduce((sum, session) => sum + session.unread_count, 0);
    
    // 可以在这里使用totalUnreadCount进行其他操作，比如设置到状态中
    console.log('Total unread messages:', totalUnreadCount);
    
    setTotalUnreadCount(totalUnreadCount);
  }, [recvUuid, chatSessions]);

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }
    let unlisten: () => void;

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

    // 添加一个定时任务，每1分钟检查一次会话信息
    const intervalId = setInterval(() => {
      getChatSession();
    }, 60000); // 1分钟 = 60000毫秒

    const setupListener = async () => {
      // 初始获取会话数据
      await getChatSession();
      
      unlisten = await listen<string>('chat_session', (event) => {
        // 监听会话信息
        try {
          const chatSessionEvent = JSON.parse(
            event.payload,
          ) as ChatSessionEvent;
          console.log('chatSessionEvent', chatSessionEvent);
          // 只监听当前用户的会话
          if (chatSessionEvent.data.recv_user !== recvUuid) {
            return;
          }
          // 更新会话信息
          setChatSessions((prev) => {
            const index = prev.findIndex(
              (item) => item.send_user === chatSessionEvent.data.send_user && item.recv_user === chatSessionEvent.data.recv_user,
            );
            if (index === -1) {
              return [...prev, chatSessionEvent.data];
            }
            const newChatSessions = [...prev];
            newChatSessions[index] = chatSessionEvent.data;
            return newChatSessions;
          });
        } catch (e) {
          console.log('接受信息错误', e);
        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten(); // 组件卸载时取消事件监听
      if (intervalId) clearInterval(intervalId); // 组件卸载时清除定时器
    };
  }, [recvUuid]);

  return { totalUnreadCount };
};

export { useChatsUnread };
