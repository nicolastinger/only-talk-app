import { invoke } from "@tauri-apps/api/core";

/**
 * 打开外部链接。
 *
 * 走 Rust 命令 `open_external_url`(桌面→系统默认浏览器; Android/iOS→系统 Intent/默认程序),
 * 不依赖 opener 插件的 JS 权限, 桌面/移动端行为一致。
 * 非 Tauri(纯浏览器)环境下 invoke 会失败, 回退到 `window.open`。
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  if (!url) return;
  try {
    await invoke("open_external_url", { url });
  } catch (e) {
    console.error("open_external_url failed:", e);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }
};
