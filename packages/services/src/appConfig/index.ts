import { invoke } from "@tauri-apps/api/core";
import { CLIENT_CONFIG_KEYS, ClientConfigItem, TALK_API } from "@workspace/types";
import { fetchFileTypeConfig } from "../fileTypeConfigService";
import { setApiBase } from "../httpService";

/**
 * 客户端配置(公共库 client_config 表 ↔ 前端内存)。
 *
 * 启动时由 `initAppConfig()` 拉取全部配置: 设置 API 基础地址(httpService.getApiBase)、
 * 默认主题/语言等。`setConfig/resetConfig` 走 Tauri 命令持久化, 立即生效。
 */
const configMap = new Map<string, string>();

/** 初始化客户端配置: 从公共库 client_config 表拉取全部, 写入内存并设置 API base */
export const initAppConfig = async (): Promise<void> => {
  try {
    const items = await invoke<ClientConfigItem[]>("get_all_client_config");
    configMap.clear();
    items.forEach((item) => configMap.set(item.key, item.value));
    const apiBase = configMap.get(CLIENT_CONFIG_KEYS.serverApiBase);
    if (apiBase) setApiBase(apiBase);
    // 预热服务端上传文件类型白名单(失败静默降级, 不阻塞启动)
    fetchFileTypeConfig().catch(() => {});
  } catch (e) {
    console.error("初始化客户端配置失败:", e);
  }
};

/** 读取配置项(内存) */
export const getConfig = (key: string): string | undefined => configMap.get(key);

/** 持久化写入配置项(表 + 内存), 若为 api_base 立即切换 */
export const setConfig = async (key: string, value: string): Promise<void> => {
  await invoke("set_client_config", { key, value });
  configMap.set(key, value);
  if (key === CLIENT_CONFIG_KEYS.serverApiBase) {
    setApiBase(value);
    fetchFileTypeConfig(true).catch(() => {});
  }
};

/** 直接读表(不经内存), 一般无需使用 */
export const getConfigFromStore = async (key: string): Promise<string | undefined> => {
  const value = await invoke<string | null>("get_client_config", { key });
  return value ?? undefined;
};

/** 删除配置项并恢复环境默认(表 + 内存) */
export const resetConfig = async (key: string): Promise<void> => {
  await invoke("reset_client_config", { key });
  configMap.delete(key);
  if (key === CLIENT_CONFIG_KEYS.serverApiBase) setApiBase(TALK_API);
};

/** QUIC/NAT 域名(server.domain) */
export const getServerDomain = (): string =>
  configMap.get(CLIENT_CONFIG_KEYS.serverDomain) || "";

/** 应用默认主题(app.theme, 兜底 light) */
export const getAppTheme = (): string =>
  configMap.get(CLIENT_CONFIG_KEYS.appTheme) || "light";

/** 应用默认语言(app.language, 兜底 zh-CN) */
export const getAppLanguage = (): string =>
  configMap.get(CLIENT_CONFIG_KEYS.appLanguage) || "zh-CN";