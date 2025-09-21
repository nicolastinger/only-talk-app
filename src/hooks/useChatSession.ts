import { ChatSessionEvent } from '@/types/backend/vo';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

// 监听会话信息
const useChatSession = () => {
  const [chatSessionEvent, setChatSessionEvent] = useState<ChatSessionEvent>();

  useEffect(() => {
    let unlisten: () => void;

    const setupListener = async () => {
      unlisten = await listen<string>('chat_session', (event) => {
        // 监听会话信息
        try {
          const chatSessionEvent = JSON.parse(
            event.payload,
          ) as ChatSessionEvent;
          console.log('chatSessionEvent', chatSessionEvent);
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
  }, []);

  return { chatSessionEvent };
};

export { useChatSession };
