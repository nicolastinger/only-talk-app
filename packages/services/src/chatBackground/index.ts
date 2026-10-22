import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { selectFile } from "../fileService";

/**
 * 聊天背景(仅客户端)。
 *
 * - 用户在设置里选择图片, Rust 端把文件复制到 `app_data_dir/chat_backgrounds/`
 *   (独立目录, 永不过期, 不参与任何清理), 并在用户库 `chat_background` 表里留存历史记录;
 * - 背景不会上传服务端, 换设备/重装后需要重新选择;
 * - 生效背景用 `is_active` 标记, 通过 `setActiveChatBackground` 在历史间切换;
 * - 变更后广播 `CHAT_BACKGROUND_CHANGED_EVENT`, 聊天页监听后即时刷新, 无需重启。
 */

export interface ChatBackgroundVo {
  id: number;
  /** 相对 chat_backgrounds 目录的文件名 */
  file_name: string;
  /** 绝对文件路径 */
  file_path: string;
  is_active: boolean;
  created_at: number;
}

/** 聊天背景变更事件名(同一 webview 内通信) */
export const CHAT_BACKGROUND_CHANGED_EVENT = "chat-background-changed";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

const notifyChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAT_BACKGROUND_CHANGED_EVENT));
};

/** 文件绝对路径 -> webview 可访问 URL(tauri asset protocol) */
export const resolveChatBackgroundUrl = (filePath: string): string => {
  try {
    return convertFileSrc(filePath);
  } catch (e) {
    console.error("解析聊天背景路径失败:", e);
    return "";
  }
};

/** 打开系统文件选择器挑一张背景图, 取消返回 null */
export const pickChatBackgroundImage = async (): Promise<string | null> => {
  const files = await selectFile(false, false, [
    { name: "Images", extensions: IMAGE_EXTENSIONS },
  ]);
  if (!files || files.length === 0) return null;
  return files.flat()[0] ?? null;
};

/**
 * 导入并立即应用一张背景图。
 * Android 相册返回的 content:// URI 先交给 `copy_file_to_temp` 转成真实路径。
 */
export const importChatBackground = async (
  uriOrPath: string
): Promise<ChatBackgroundVo> => {
  let filePath = uriOrPath;
  if (filePath.startsWith("content://")) {
    filePath = await invoke<string>("copy_file_to_temp", {
      uriOrPath: filePath,
    });
  }
  const background = await invoke<ChatBackgroundVo>("import_chat_background", {
    uriOrPath: filePath,
  });
  notifyChanged();
  return background;
};

/** 全部背景记录(新→旧, 含历史) */
export const listChatBackgrounds = (): Promise<ChatBackgroundVo[]> =>
  invoke<ChatBackgroundVo[]>("list_chat_backgrounds");

/** 切换生效背景; 传 null 恢复默认(保留历史记录) */
export const setActiveChatBackground = async (
  id: number | null
): Promise<void> => {
  await invoke("set_active_chat_background", { id });
  notifyChanged();
};

/** 删除一条历史背景(记录 + 本地文件) */
export const deleteChatBackground = async (id: number): Promise<void> => {
  await invoke("delete_chat_background", { id });
  notifyChanged();
};
