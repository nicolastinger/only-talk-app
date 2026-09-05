import { reactive, watch } from "vue";
import {
  get_user_info_with_cache,
  refresh_user_info,
  getFiles,
} from "@workspace/services";
import type { UserInfo } from "@workspace/types";

/**
 * 群成员昵称/头像解析（对齐 PC useGroupMemberInfo）
 * 用法：const { memberMap, avatarUrlMap } = useGroupMemberInfo(() => uniqueSenderUuids)
 * memberMap:    uuid -> UserInfo（含 username / icon）
 * avatarUrlMap: uuid -> 头像本地 URL（解析完成前为 null，完成自动响应）
 */
const memberInfoCache = new Map<string, UserInfo>();
const avatarUrlCache = new Map<string, string | null>();
const fetching = new Set<string>();
const avatarFetching = new Set<string>();

const resolveAvatarUrl = async (icon: string): Promise<string | null> => {
  if (avatarUrlCache.has(icon)) return avatarUrlCache.get(icon)!;
  if (avatarFetching.has(icon)) return null;
  avatarFetching.add(icon);
  try {
    const files = await getFiles(icon);
    const url = files?.[0]?.tauri_file_path || null;
    avatarUrlCache.set(icon, url);
    return url;
  } catch {
    avatarUrlCache.set(icon, null);
    return null;
  } finally {
    avatarFetching.delete(icon);
  }
};

export function useGroupMemberInfo(uuidsGetter: () => string[]) {
  const memberMap = reactive<Record<string, UserInfo>>({});
  const avatarUrlMap = reactive<Record<string, string | null>>({});

  const setAvatar = (uuid: string, icon?: string) => {
    if (!icon || avatarUrlMap[uuid] !== undefined) return;
    const cached = avatarUrlCache.has(icon);
    if (cached) {
      avatarUrlMap[uuid] = avatarUrlCache.get(icon)!;
      return;
    }
    resolveAvatarUrl(icon).then((url) => {
      avatarUrlMap[uuid] = url;
    });
  };

  watch(
    () => [...new Set(uuidsGetter().filter(Boolean))].sort().join(","),
    async (key) => {
      const list = key.split(",").filter(Boolean);
      if (list.length === 0) return;

      for (const uuid of list) {
        const cached = memberInfoCache.get(uuid);
        if (cached) {
          memberMap[uuid] = cached;
          setAvatar(uuid, cached.icon);
          continue;
        }
        if (fetching.has(uuid)) continue;
        fetching.add(uuid);
        try {
          const result = await get_user_info_with_cache(uuid);
          memberInfoCache.set(uuid, result.user_info);
          memberMap[uuid] = result.user_info;
          setAvatar(uuid, result.user_info.icon);
          // 命中缓存时后台刷新一次，保证昵称/头像最终一致
          if (result.from_cache) {
            refresh_user_info(uuid)
              .then((fresh) => {
                memberInfoCache.set(uuid, fresh);
                memberMap[uuid] = fresh;
                setAvatar(uuid, fresh.icon);
              })
              .catch(() => {});
          }
        } catch (e) {
          console.error("[useGroupMemberInfo] 获取成员信息失败:", uuid, e);
        } finally {
          fetching.delete(uuid);
        }
      }
    },
    { immediate: true }
  );

  return { memberMap, avatarUrlMap };
}
