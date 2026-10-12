import { ref, watch } from "vue";
import { get_cached_user_info, get_user_info_with_cache } from "@workspace/services";
import { useUserStore } from "@/stores/user";
import { getUserAvatarUrl } from "@/utils/api";

/**
 * 解析「我」的头像 URL。
 * userInfo 全局 store 仅在 Profile 等页 loadUserInfo 后才填充，
 * 聊天页经常进入时还是 null → 头像加载不到。
 * 因此这里做多层兜底：store.icon → 本地缓存用户信息 → 服务端用户信息。
 */
export function useMyAvatar(meUuidGetter: () => string) {
  const myAvatar = ref<string | null>(null);
  const { userInfo } = useUserStore();

  const resolveMyIcon = async (): Promise<string | null> => {
    const uuid = meUuidGetter();
    if (!uuid) return null;

    if (userInfo.value?.icon) return userInfo.value.icon;

    // 本地缓存（登录/同步时通常已写入）
    try {
      const cached = await get_cached_user_info(uuid);
      if (cached?.icon) return cached.icon;
    } catch {
      // ignore
    }

    // 本地无缓存 → 请求服务器（带回写缓存）
    try {
      const result = await get_user_info_with_cache(uuid);
      if (result.user_info?.icon) return result.user_info.icon;
    } catch {
      // ignore（离线时保留默认头像）
    }
    return null;
  };

  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const ensureMyAvatar = async (force = false) => {
    if (!force && myAvatar.value) return;
    const icon = await resolveMyIcon();
    if (!icon) return;
    const url = await getUserAvatarUrl(icon);
    if (url) {
      myAvatar.value = url;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      return;
    }
    // 文件服务偶发未就绪（离线/下载慢），稍后自动重试一次
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        ensureMyAvatar(true).catch(() => {});
      }, 1500);
    }
  };

  // store 加载完成后（如用户后来进过资料页）自动补齐头像
  watch(
    () => userInfo.value?.icon,
    () => {
      ensureMyAvatar(true);
    }
  );

  return { myAvatar, ensureMyAvatar };
}
