import { invoke } from "@tauri-apps/api/core";
import type { RustResponse } from "@workspace/types";
import { getFiles } from "@workspace/services";

export function parseResponse<T>(res: RustResponse): T {
  if (!res.netSuccess) {
    throw new Error(res.error || "网络请求失败");
  }
  const data = JSON.parse(res.res.body);
  if (data.code !== 200) {
    throw new Error(data.message || "请求失败");
  }
  return data.data as T;
}

let _cachedUuid: string | null = null;

export async function getMyUuid(): Promise<string> {
  if (_cachedUuid) return _cachedUuid;
  const uuid = (await invoke("get_user_map", { key: "uuid" })) as string;
  _cachedUuid = uuid;
  return uuid;
}

export async function getMyAccount(): Promise<string> {
  return (await invoke("get_user_map", { key: "account" })) as string;
}

export function clearUuidCache() {
  _cachedUuid = null;
}

export async function getUserAvatarUrl(icon: string): Promise<string | null> {
  try {
    const files = await getFiles(icon);
    return files?.[0]?.tauri_file_path || null;
  } catch {
    return null;
  }
}
