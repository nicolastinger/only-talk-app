import { invoke } from "@tauri-apps/api/core";
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  hasLocalChatFile,
  type ChatFileDownloadProgress,
} from "@workspace/services";

/** 聊天图片/文件的本地解析缓存（对齐 PC 各 ChatBox 顶部的 imageCache） */

const imageUrlCache = new Map<string, string | null>();
const pendingImage = new Map<string, Promise<string | null>>();

/** 依据 biz_id 解析图片本地 URL（tauri asset url），带进程级缓存 */
export const loadImageUrl = (
  bizId: string,
  nanoId?: string
): Promise<string | null> => {
  if (imageUrlCache.has(bizId)) {
    return Promise.resolve(imageUrlCache.get(bizId)!);
  }
  if (pendingImage.has(bizId)) return pendingImage.get(bizId)!;

  const promise = (async () => {
    try {
      const files = await getChatFileByBizId(bizId, nanoId);
      const url = files?.[0]?.tauri_file_path || null;
      imageUrlCache.set(bizId, url);
      return url;
    } catch (e) {
      console.error("loadImageUrl 失败:", bizId, e);
      imageUrlCache.set(bizId, null);
      return null;
    } finally {
      pendingImage.delete(bizId);
    }
  })();

  pendingImage.set(bizId, promise);
  return promise;
};

/** 依据 biz_id 解析聊天文件（返回首个 FileVo，用于打开文件等） */
export const loadChatFile = async (
  bizId: string,
  nanoId?: string,
  onProgress?: (progress: ChatFileDownloadProgress) => void
) => {
  try {
    const files = await getChatFileByBizId(bizId, nanoId, onProgress);
    return files?.[0] || null;
  } catch (e) {
    console.error("loadChatFile 失败:", bizId, e);
    return null;
  }
};

/** 判断本地是否已下载该聊天文件（只查本地 file_record，不触发远程下载） */
export const checkLocalChatFile = async (bizId: string): Promise<boolean> => {
  try {
    return await hasLocalChatFile(bizId);
  } catch (e) {
    console.error("checkLocalChatFile 失败:", bizId, e);
    return false;
  }
};

/** 从文件服务返回的 tauri 资源地址还原为可打开的本机路径（对齐 PC ChatFile.getLocalPath，兼容各端 asset 协议前缀） */
export const toLocalPath = (tauriFilePath: string): string => {  let localPath = tauriFilePath;
  const assetPrefixes = [
    "http://asset.localhost/",
    "https://asset.localhost/",
    "asset://localhost/",
    "tauri://localhost/",
    "asset://",
  ];
  for (const prefix of assetPrefixes) {
    if (tauriFilePath.startsWith(prefix)) {
      localPath = tauriFilePath.slice(prefix.length);
      break;
    }
  }
  // 去掉可能存在的查询/哈希后缀
  const cutIdx = localPath.search(/[?#]/);
  if (cutIdx > 0) localPath = localPath.slice(0, cutIdx);
  try {
    localPath = decodeURIComponent(localPath);
  } catch {
    // keep as-is
  }
  if (localPath.includes(":\\") && localPath.includes("/")) {
    localPath = localPath.replace(/\//g, "\\");
  }
  return localPath;
};

/* ==================== 语音播放 ==================== */

/** 依据扩展名推断音频 MIME（Blob 播放需要正确的 Content-Type） */
const guessAudioMime = (nameOrPath?: string): string => {
  const ext =
    (nameOrPath || "").split(/[.\\/]/).pop()?.toLowerCase() || "";
  switch (ext) {
    case "webm":
      return "audio/webm";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    default:
      return "audio/webm";
  }
};

/** 可播放音频地址 + 释放函数 */
export interface PlayableAudio {
  url: string;
  revoke: () => void;
}

/**
 * 解析语音消息的可播放地址。
 *
 * Android WebView 无法可靠加载 `asset:` 协议的媒体资源（`<audio>` 的媒体加载
 * 不经过 shouldInterceptRequest），直接播放 asset URL 会失败。故优先通过
 * `read_local_file_bytes` 读取文件字节并构造 Blob URL（`blob:` 已在 CSP
 * media-src 放行）；读取失败时回退 asset URL（桌面等平台仍可播放）。
 */
export const resolvePlayableAudio = async (
  bizId?: string,
  nanoId?: string,
  localPath?: string
): Promise<PlayableAudio | null> => {
  let absPath = localPath || "";
  let mime = guessAudioMime(localPath);
  let fallbackAsset = localPath ? convertPathToTauriUrl(localPath) : null;

  if (!absPath) {
    if (!bizId) return null;
    const file = await loadChatFile(bizId, nanoId);
    absPath = file?.absolute_file_path || "";
    mime = file?.mime_type || guessAudioMime(
      file?.file_extension || file?.original_file_name
    );
    fallbackAsset = fallbackAsset || file?.tauri_file_path || null;
  }

  if (absPath) {
    try {
      const raw = (await invoke("read_local_file_bytes", {
        filePath: absPath,
      })) as ArrayBuffer | number[];
      const bytes =
        raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);
      if (bytes.byteLength > 0) {
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        let revoked = false;
        return {
          url,
          revoke: () => {
            if (revoked) return;
            revoked = true;
            URL.revokeObjectURL(url);
          },
        };
      }
    } catch (e) {
      console.error("读取音频文件失败:", absPath, e);
    }
  }

  if (fallbackAsset) {
    return { url: fallbackAsset, revoke: () => {} };
  }
  return null;
};
