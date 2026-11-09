import { ref } from 'vue';
import type { ChatSessionEvent } from '@workspace/types';
import { useBackendEvent } from './useBackendEvent';

// 监听会话信息
export const useChatSession = (recvUuid: string) => {
  const chatSessionEvent = ref<ChatSessionEvent>();

  useBackendEvent('chat_session', (payload) => {
    try {
      const event = JSON.parse(payload) as ChatSessionEvent;
      console.log('chatSessionEvent', event);
      // 只监听当前用户的会话
      if (
        event.data.recv_user !== recvUuid &&
        event.data.send_user !== recvUuid
      ) {
        return;
      }
      chatSessionEvent.value = event;
    } catch (e) {
      console.log('接受信息错误', e);
    }
  });

  return { chatSessionEvent };
};
