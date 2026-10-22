import { ref } from "vue";
import {
  CHAT_BACKGROUND_CHANGED_EVENT,
  listChatBackgrounds,
  resolveChatBackgroundUrl,
  type ChatBackgroundVo,
} from "@workspace/services";

/**
 * 聊天背景(仅客户端)。
 *
 * - Rust 端把用户选择的图片复制到 `app_data_dir/chat_backgrounds/` 永久目录,
 *   并在用户库 `chat_background` 表留存历史, 从不上传服务端;
 * - 这里缓存当前生效背景 URL + 历史列表, 供聊天页与设置页共用;
 * - 设置页上传/切换/删除后广播 `chat-background-changed`, 已打开的聊天页即时刷新。
 */

const backgrounds = ref<ChatBackgroundVo[]>([]);
const activeUrl = ref<string | null>(null);
let started = false;

/** 重新读取历史列表与当前生效背景 */
export const refreshChatBackground = async (): Promise<void> => {
  try {
    const list = await listChatBackgrounds();
    backgrounds.value = list;
    const active = list.find((item) => item.is_active);
    activeUrl.value = active
      ? resolveChatBackgroundUrl(active.file_path)
      : null;
  } catch (e) {
    console.error("加载聊天背景失败:", e);
  }
};

/** 首次调用时建立监听(幂等) */
const ensureStarted = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener(CHAT_BACKGROUND_CHANGED_EVENT, () => {
    refreshChatBackground().catch(() => {});
  });
  // 启动时先加载一次(失败会在聊天页 onMounted 时重试)
  refreshChatBackground().catch(() => {});
};

export const useChatBackgroundStore = () => {
  ensureStarted();
  return {
    backgrounds,
    activeUrl,
    refresh: refreshChatBackground,
  };
};
