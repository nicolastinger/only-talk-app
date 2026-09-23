import { FileTypeConfig } from "@workspace/types";
import { invoke_rust, parseBackendResponse } from "../httpService";

/**
 * 服务端上传文件类型白名单(扩展名)同步服务。
 *
 * 客户端在启动/切换 API 地址时拉取服务端配置缓存到内存,
 * 文件/图片选择器据此过滤可选后缀, 与服务端校验保持一致。
 * 拉取失败时静默降级到兜底列表(不阻塞用户选择)。
 */

/** 图片扩展名兜底(服务端不可达或未返回时使用, 与旧版客户端一致) */
const FALLBACK_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

/** 文件扩展名兜底: 请求失败时放开全部文件, 由服务端校验兜底 */
const FALLBACK_FILE_EXTENSIONS = ["*"];

let cachedConfig: FileTypeConfig | null = null;
let fetching: Promise<FileTypeConfig | null> | null = null;

/**
 * 拉取服务端上传文件类型白名单并缓存。
 * @param force 是否忽略缓存强制重新拉取(切换 API 地址后使用)
 * @returns 配置或 null(请求失败)
 */
export const fetchFileTypeConfig = async (
  force: boolean = false
): Promise<FileTypeConfig | null> => {
  if (!force && cachedConfig) return cachedConfig;
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      const res = await invoke_rust(
        "get_request",
        "/file_integrated/file_type_config",
        ""
      );
      cachedConfig = parseBackendResponse<FileTypeConfig>(res);
      return cachedConfig;
    } catch (e) {
      console.error("拉取文件类型配置失败:", e);
      return null;
    } finally {
      fetching = null;
    }
  })();
  return fetching;
};

/** 图片选择器允许的扩展名(服务端 image 分组, 失败兜底默认图片列表) */
export const getImageExtensions = async (): Promise<string[]> => {
  const config = await fetchFileTypeConfig();
  return config?.image?.extensions?.length
    ? config.image.extensions
    : FALLBACK_IMAGE_EXTENSIONS;
};

/** 文件选择器允许的扩展名(全部分组去重, 失败兜底全部文件) */
export const getAllFileExtensions = async (): Promise<string[]> => {
  const config = await fetchFileTypeConfig();
  if (!config) return FALLBACK_FILE_EXTENSIONS;
  const groups = [
    config.image,
    config.document,
    config.archive,
    config.audio,
    config.video,
  ];
  const extensions = groups
    .flatMap((g) => g?.extensions ?? [])
    .map((s) => s?.toLowerCase())
    .filter(Boolean);
  return extensions.length
    ? [...new Set(extensions)]
    : FALLBACK_FILE_EXTENSIONS;
};
