import { useUnreadStore } from "@/stores/unread";

// 会话列表/未读状态已提升为全局单例（stores/unread.ts），
// 此 hook 仅作兼容封装，供页面读取共享状态，不再自建监听。
export function useChatSessions() {
  const { sessions, loading, refresh } = useUnreadStore();
  return { sessions, loading, refresh };
}
