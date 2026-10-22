import {
  CHAT_BACKGROUND_CHANGED_EVENT,
  getFriendChatBackground,
  listChatBackgrounds,
  resolveChatBackgroundUrl,
} from '@workspace/services';
import { useEffect, useState } from 'react';

/**
 * 当前生效的聊天背景 URL。
 *
 * 优先读取好友专属背景; 该好友未设置时回退到全局背景。
 * 设置页上传 / 切换 / 删除背景后会广播 `chat-background-changed` 事件,
 * 已打开的聊天页监听该事件即时刷新, 无需重新进入会话。
 */
const useChatBackground = (friendUuid?: string) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (friendUuid) {
          const friend = await getFriendChatBackground(friendUuid);
          if (!mounted) return;
          if (friend) {
            setUrl(resolveChatBackgroundUrl(friend.file_path));
            return;
          }
        }
        const list = await listChatBackgrounds();
        if (!mounted) return;
        const active = list.find((item) => item.is_active);
        setUrl(active ? resolveChatBackgroundUrl(active.file_path) : null);
      } catch {
        if (mounted) setUrl(null);
      }
    };
    load();
    window.addEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
    return () => {
      mounted = false;
      window.removeEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
    };
  }, [friendUuid]);

  return url;
};

export { useChatBackground };
