import { onMounted, onUnmounted, ref, watch } from 'vue';
import {
  CHAT_BACKGROUND_CHANGED_EVENT,
  getFriendChatBackground,
  listChatBackgrounds,
  resolveChatBackgroundUrl,
} from '@workspace/services';

/**
 * 当前生效的聊天背景 URL。
 *
 * 优先读取好友专属背景; 该好友未设置时回退到全局背景。
 * 设置页上传 / 切换 / 删除背景后会广播 `chat-background-changed` 事件,
 * 已打开的聊天页监听该事件即时刷新, 无需重新进入会话。
 */
export const useChatBackground = (friendUuid?: string) => {
  const url = ref<string | null>(null);
  let mounted = true;

  const load = async () => {
    try {
      if (friendUuid) {
        const friend = await getFriendChatBackground(friendUuid);
        if (!mounted) return;
        if (friend) {
          url.value = resolveChatBackgroundUrl(friend.file_path);
          return;
        }
      }
      const list = await listChatBackgrounds();
      if (!mounted) return;
      const active = list.find((item) => item.is_active);
      url.value = active ? resolveChatBackgroundUrl(active.file_path) : null;
    } catch {
      if (mounted) url.value = null;
    }
  };

  onMounted(() => {
    load();
    window.addEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
  });
  watch(() => friendUuid, load);
  onUnmounted(() => {
    mounted = false;
    window.removeEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
  });

  return url;
};
