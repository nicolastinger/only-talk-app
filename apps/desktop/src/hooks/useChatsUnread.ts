import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { ChatSessionEvent, ChatSessionVo } from '@workspace/types';
import { useBackendEvent } from './useBackendEvent';

// 监听会话信息
export const useChatsUnread = (recvUuid: string) => {
  const chatSessions = ref<ChatSessionVo[]>([]);

  const totalUnreadCount = computed(() =>
    chatSessions.value.reduce(
      (total, session) => total + session.unread_count,
      0,
    ),
  );

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const getChatSession = async () => {
    if (recvUuid === '') return;
    try {
      const res = (await invoke(
        'get_chat_session_from_store',
        {},
      )) as ChatSessionVo[];
      console.log('get_chat_session', res);
      chatSessions.value = res;
    } catch (e) {
      console.log(e);
    }
  };

  const start = () => {
    if (recvUuid === '') return;
    getChatSession();
    // 每 30s 检查一次会话信息
    intervalId = setInterval(getChatSession, 30000);
  };

  onMounted(start);
  watch(() => recvUuid, start);
  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId);
  });

  useBackendEvent('chat_session', (payload) => {
    try {
      const event = JSON.parse(payload) as ChatSessionEvent;
      console.log('chatSessionEvent', event);
      // 只监听当前用户的会话
      if (event.data.recv_user !== recvUuid) return;

      const index = chatSessions.value.findIndex(
        (item) =>
          item.send_user === event.data.send_user &&
          item.recv_user === event.data.recv_user,
      );
      if (index === -1) {
        chatSessions.value = [...chatSessions.value, event.data];
        return;
      }
      if (event.type === 0) {
        event.data.unread_count = 0;
        const next = [...chatSessions.value];
        next[index] = event.data;
        chatSessions.value = next;
      } else if (event.type === 1) {
        const next = [...chatSessions.value];
        event.data.unread_count =
          event.data.unread_count + next[index].unread_count;
        next[index] = event.data;
        chatSessions.value = next;
      }
    } catch (e) {
      console.log('接受信息错误', e);
    }
  });

  return { totalUnreadCount };
};
