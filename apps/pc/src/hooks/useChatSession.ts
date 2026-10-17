import { ChatSessionEvent } from '@workspace/types';
import { useState } from 'react';
import { useBackendEvent } from './useBackendEvent';

// 监听会话信息
const useChatSession = (recvUuid: string) => {
  const [chatSessionEvent, setChatSessionEvent] = useState<ChatSessionEvent>();

  useBackendEvent(
    'chat_session',
    (payload) => {
      // 监听会话信息
      try {
        const chatSessionEvent = JSON.parse(payload) as ChatSessionEvent;
        console.log('chatSessionEvent', chatSessionEvent);
        // 只监听当前用户的会话
        if (
          chatSessionEvent.data.recv_user !== recvUuid &&
          chatSessionEvent.data.send_user !== recvUuid
        ) {
          return;
        }
        // 更新会话信息
        setChatSessionEvent(chatSessionEvent);
      } catch (e) {
        console.log('接受信息错误', e);
      }
    },
    recvUuid !== '',
  );

  return { chatSessionEvent };
};

export { useChatSession };
