import { useBearStore } from '@/store/store';
import { ChatSessionEvent } from '@/types/backend/vo';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

// 监听会话信息
const useChatSession = (recvUuid: string) => {
  const [chatSessionEvent, setChatSessionEvent] = useState<ChatSessionEvent>();

  useEffect(() => {
    if (recvUuid === '') {
      return;
    }
    let unlisten: () => void;

    const setupListener = async () => {
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
          setChatSessionEvent(chatSessionEvent);
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

  return { chatSessionEvent };
};

export { useChatSession };
