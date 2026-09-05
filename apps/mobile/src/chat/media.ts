import { getChatFileByBizId } from "@workspace/services";

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
export const loadChatFile = async (bizId: string, nanoId?: string) => {
  try {
    const files = await getChatFileByBizId(bizId, nanoId);
    return files?.[0] || null;
  } catch (e) {
    console.error("loadChatFile 失败:", bizId, e);
    return null;
  }
};

/** 从文件服务返回的 tauri 资源地址还原为可打开的本机路径（对齐 PC ChatFile.getLocalPath） */
export const toLocalPath = (tauriFilePath: string): string => {
  let localPath = tauriFilePath;
  if (tauriFilePath.startsWith("http://asset.localhost/")) {
    localPath = tauriFilePath.replace("http://asset.localhost/", "");
    try {
      localPath = decodeURIComponent(localPath);
    } catch {
      // keep as-is
    }
  }
  if (localPath.includes(":\\") && localPath.includes("/")) {
    localPath = localPath.replace(/\//g, "\\");
  }
  return localPath;
};
