import { invoke } from "@tauri-apps/api/core";
import { CLIENT_CONFIG_KEYS } from "@workspace/types";
import { getConfig, getConfigFromStore, setConfig } from "../appConfig";

/**
 * 网络类型 / WiFi 自动下载判定。
 *
 * - `getNetworkType` 经 Tauri 命令 `get_network_type` 获取当前接入类型（Android 由
 *   ConnectivityManager 判定；桌面端返回 ethernet，视为非计量网络）。
 * - `shouldAutoDownloadImage` 组合「自动下载开关」与「是否非计量网络」，用于聊天图片/视频
 *   是否直接下载；非 WiFi 环境下即使开关勾选也不自动下载，改由用户点击触发。
 */
export type NetworkType =
  | "wifi"
  | "ethernet"
  | "cellular"
  | "offline"
  | "unknown";

const NETWORK_TYPES: NetworkType[] = [
  "wifi",
  "ethernet",
  "cellular",
  "offline",
  "unknown",
];

/** 网络类型缓存时长：短时间内多条消息渲染避免重复 invoke */
const NETWORK_TYPE_TTL = 15_000;
let networkCache: { type: NetworkType; ts: number } | null = null;

/** 获取当前网络接入类型（带进程级缓存，`force` 可强制刷新） */
export const getNetworkType = async (force = false): Promise<NetworkType> => {
  const now = Date.now();
  if (!force && networkCache && now - networkCache.ts < NETWORK_TYPE_TTL) {
    return networkCache.type;
  }

  let type: NetworkType = "unknown";
  try {
    const raw = await invoke<string>("get_network_type");
    if (NETWORK_TYPES.includes(raw as NetworkType)) {
      type = raw as NetworkType;
    }
  } catch (e) {
    console.error("get_network_type 失败:", e);
  }

  networkCache = { type, ts: now };
  return type;
};

/** 是否为非计量网络（WiFi / 有线均可自动下载，蜂窝等按需下载） */
export const isUnmeteredNetwork = async (force = false): Promise<boolean> => {
  const type = await getNetworkType(force);
  return type === "wifi" || type === "ethernet";
};

/** 读取「WiFi 下自动下载图片和视频」开关（默认开启） */
export const getAutoDownloadOnWifi = async (): Promise<boolean> => {
  const memory = getConfig(CLIENT_CONFIG_KEYS.autoDownloadWifi);
  if (memory === "0") return false;
  if (memory === "1") return true;

  const fromStore = await getConfigFromStore(
    CLIENT_CONFIG_KEYS.autoDownloadWifi
  );
  return fromStore !== "0";
};

/** 写入自动下载开关（持久化到 client_config） */
export const setAutoDownloadOnWifi = async (value: boolean): Promise<void> => {
  await setConfig(CLIENT_CONFIG_KEYS.autoDownloadWifi, value ? "1" : "0");
};

/** 当前是否应自动下载聊天图片：开关开启且处于非计量网络 */
export const shouldAutoDownloadImage = async (
  force = false
): Promise<boolean> => {
  if (!(await getAutoDownloadOnWifi())) return false;
  return isUnmeteredNetwork(force);
};
