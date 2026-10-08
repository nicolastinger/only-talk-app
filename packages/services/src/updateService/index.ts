import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { UpdateInfo } from "@workspace/types";

/** 检查更新结果 */
export interface UpdateCheckResult {
  /** 是否有新版本 */
  hasUpdate: boolean;
  /** 新版本信息(无新版本时为 null) */
  info: UpdateInfo | null;
  /** 当前版本号 */
  currentVersion: string;
}

/** 简单语义化版本比较: a > b 返回 1, a < b 返回 -1, 相等返回 0 */
const compareVersion = (a: string, b: string): number => {
  const pa = a.replace(/^v/, "").split(".");
  const pb = b.replace(/^v/, "").split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] || 0);
    const nb = Number(pb[i] || 0);
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

/** 获取当前应用版本号(@tauri-apps/api/app getVersion) */
export const getAppVersion = async (): Promise<string> => {
  try {
    return await getVersion();
  } catch {
    return "0.0.0";
  }
};

/** 查询 GitHub Releases 最新版本并判断是否有更新(无新版本时 info 为 null) */
export const checkForUpdate = async (): Promise<UpdateCheckResult> => {
  const [currentVersion, info] = await Promise.all([
    getAppVersion(),
    invoke<UpdateInfo | null>("get_latest_release"),
  ]);
  const hasUpdate = !!info && compareVersion(info.version, currentVersion) > 0;
  return { hasUpdate, info: hasUpdate ? info : null, currentVersion };
};

/** 下载进度(来自后端 `update_download_progress` 事件) */
export interface UpdateDownloadProgress {
  /** 安装包文件名 */
  fileName: string;
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数(total 为 0 表示大小未知) */
  total: number;
}

/** 下载更新包(内部完成 SHA-256 校验), 返回本地绝对路径。
 *  传入 onProgress 时, 通过 `update_download_progress` 事件实时上报下载进度。 */
export const downloadUpdatePackage = async (
  info: UpdateInfo,
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<string> => {
  let unlisten: (() => void) | undefined;
  if (onProgress) {
    unlisten = await listen<UpdateDownloadProgress>(
      "update_download_progress",
      (event) => onProgress(event.payload)
    );
  }
  try {
    return await invoke<string>("download_update_package", {
      url: info.download_url,
      fileName: info.file_name,
      sha256: info.sha256 ?? null,
      size: info.size ?? null,
    });
  } finally {
    unlisten?.();
  }
};

/** 安装更新包(Windows 静默安装并重启 / Android 调起系统安装器) */
export const installUpdate = async (localPath: string): Promise<void> => {
  await invoke("install_update", { path: localPath });
};

/** 字节数格式化为可读大小(如 86.3 MB) */
export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};
