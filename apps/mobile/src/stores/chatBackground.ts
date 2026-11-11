import { ref, watch } from "vue";
import {
  CHAT_BACKGROUND_CHANGED_EVENT,
  getFriendChatBackground,
  listChatBackgrounds,
  resolveChatBackgroundUrl,
  type ChatBackgroundVo,
} from "@workspace/services";

/**
 * 聊天背景(仅客户端)。
 *
 * - Rust 端把用户选择的图片复制到 `app_data_dir/chat_backgrounds/` 永久目录,
 *   全局历史记录存 `chat_background` 表, 好友专属背景存 `friend_chat_background` 表;
 * - 聊天页优先使用好友专属背景, 该好友未设置时回退全局背景, 再回退主题渐变;
 * - 设置页上传/切换/删除后广播 `chat-background-changed`, 已打开的聊天页即时刷新。
 */

const backgrounds = ref<ChatBackgroundVo[]>([]);
const activeUrl = ref<string | null>(null);
/** 背景变更版本号: 供聊天页 watch 后重新解析(好友优先) */
const version = ref(0);
let started = false;

/** 重新读取全局历史列表与当前生效背景 */
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

/** 解析某会话实际使用的背景: 好友专属 > 全局 > null(主题渐变) */
export const resolveChatBackgroundFor = async (
  friendUuid?: string
): Promise<string | null> => {
  if (friendUuid) {
    try {
      const friend = await getFriendChatBackground(friendUuid);
      if (friend) return resolveChatBackgroundUrl(friend.file_path);
    } catch (e) {
      console.error("读取好友聊天背景失败:", e);
    }
  }
  if (!activeUrl.value) await refreshChatBackground();
  return activeUrl.value;
};

/** 首次调用时建立监听(幂等) */
const ensureStarted = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener(CHAT_BACKGROUND_CHANGED_EVENT, () => {
    version.value += 1;
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

/**
 * 某会话的响应式背景 URL: `getFriendUuid` 返回好友 uuid(群聊/全局传 undefined)。
 * 背景变更或会话切换时自动重新解析。
 */
export const useChatBackgroundFor = (
  getFriendUuid: () => string | undefined
) => {
  ensureStarted();
  const url = ref<string | null>(null);

  watch(
    [version, getFriendUuid, activeUrl],
    async () => {
      url.value = await resolveChatBackgroundFor(getFriendUuid());
    },
    { immediate: true }
  );

  return url;
};
