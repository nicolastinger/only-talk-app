import { invoke, convertFileSrc } from "@tauri-apps/api/core";

/**
 * 移动端图片发送/头像上传通用工具。
 * Android 相册经 plugin-dialog 返回 content:// URI，WebView 无法直接 fetch 读取，
 * 也拿不到文件系统真实路径。统一交由 Rust 端 copy_file_to_temp：
 * Rust 通过 tauri-plugin-fs(ContentResolver) 读取 content:// 并复制到
 * umi_gitee_temp 目录，返回 Rust 可直接读取的真实路径。
 */

/**
 * 将 content:// URI 复制到应用数据临时目录，返回绝对路径与本地预览地址
 */
export async function resolveContentToTempFile(contentUri: string): Promise<{
  tempPath: string;
  preview: string;
}> {
  const tempPath = await invoke<string>("copy_file_to_temp", {
    uriOrPath: contentUri,
  });
  return { tempPath, preview: convertFileSrc(tempPath) };
}
