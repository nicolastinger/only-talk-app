import {
  CHAT_BACKGROUND_CHANGED_EVENT,
  listChatBackgrounds,
  resolveChatBackgroundUrl,
} from '@workspace/services';
import { useEffect, useState } from 'react';

/**
 * 当前生效的聊天背景 URL。
 *
 * 设置页上传 / 切换 / 删除背景后会广播 `chat-background-changed` 事件,
 * 已打开的聊天页监听该事件即时刷新, 无需重新进入会话。
 */
const useChatBackground = () => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      listChatBackgrounds()
        .then((list) => {
          if (!mounted) return;
          const active = list.find((item) => item.is_active);
          setUrl(active ? resolveChatBackgroundUrl(active.file_path) : null);
        })
        .catch(() => {
          if (mounted) setUrl(null);
        });
    };
    load();
    window.addEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
    return () => {
      mounted = false;
      window.removeEventListener(CHAT_BACKGROUND_CHANGED_EVENT, load);
    };
  }, []);

  return url;
};

export { useChatBackground };
