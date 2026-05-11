import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getMyUuid } from "@/utils/api";
import type { ChatSessionVo, ChatSessionEvent } from "@workspace/types";

export function useChatSessions() {
  const sessions = ref<ChatSessionVo[]>([]);
  const loading = ref(false);

  let unlisten: UnlistenFn | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const fetchSessions = async () => {
    try {
      const res: ChatSessionVo[] = await invoke("get_chat_session_from_store");
      sessions.value = (res || []).sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) { console.error("加载会话列表失败:", e); }
  };

  const setupListener = async () => {
    await fetchSessions();

    unlisten = await listen<string>("chat_session", async (event) => {
      try {
        const evt: ChatSessionEvent = JSON.parse(event.payload);
        const uuid = await getMyUuid();
        if (evt.data.recv_user !== uuid) return;

        const index = sessions.value.findIndex(
          (item) => item.send_user === evt.data.send_user && item.recv_user === evt.data.recv_user
        );

        if (index === -1) {
          sessions.value.unshift(evt.data);
        } else if (evt.type === 0) {
          sessions.value[index] = { ...evt.data, unread_count: 0 };
        } else if (evt.type === 1) {
          sessions.value[index] = {
            ...evt.data,
            unread_count: sessions.value[index].unread_count + evt.data.unread_count,
          };
        }
        sessions.value = [...sessions.value].sort((a, b) => b.timestamp - a.timestamp);
      } catch (e) { console.error("处理chat_session事件失败:", e); }
    });

    pollTimer = setInterval(fetchSessions, 30000);
  };

  onMounted(() => { setupListener().catch(console.error); });
  onUnmounted(() => { if (unlisten) unlisten(); if (pollTimer) clearInterval(pollTimer); });

  return { sessions, loading, refresh: fetchSessions };
}
