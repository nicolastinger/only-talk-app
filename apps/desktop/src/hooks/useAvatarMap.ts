import { computed, onUnmounted, ref, watch } from 'vue';
import { getFiles } from '@workspace/services';

// 模块级缓存，跨组件共享
const avatarUrlCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

/**
 * 批量将 bizId 列表转换为可用的 tauri_file_path
 * 带缓存和请求去重
 */
export const useAvatarMap = (bizIds: (string | undefined | null)[]) => {
  const avatarMap = ref<Map<string, string>>(new Map());
  let mounted = true;

  const stableKey = computed(() =>
    bizIds
      .filter(Boolean)
      .slice()
      .sort()
      .join(','),
  );

  const load = async () => {
    const ids = stableKey.value.split(',').filter(Boolean);
    if (ids.length === 0) return;

    // 先同步已有缓存到 state
    const cached = new Map<string, string>();
    for (const id of ids) {
      const url = avatarUrlCache.get(id);
      if (url) cached.set(id, url);
    }
    if (cached.size > 0 && mounted) {
      avatarMap.value = new Map(cached);
    }

    // 过滤出需要请求的 bizId
    const needFetch = ids.filter(
      (id) => !avatarUrlCache.has(id) && !pendingRequests.has(id),
    );
    if (needFetch.length === 0) return;

    const BATCH_SIZE = 5;
    for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
      if (!mounted) break;
      const batch = needFetch.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (bizId) => {
          if (!mounted) return;

          if (pendingRequests.has(bizId)) {
            const url = await pendingRequests.get(bizId)!;
            if (url && mounted) {
              avatarMap.value = new Map(avatarMap.value).set(bizId, url);
            }
            return;
          }

          const promise = (async () => {
            try {
              const files = await getFiles(bizId);
              const url = files?.[0]?.tauri_file_path || null;
              avatarUrlCache.set(bizId, url);
              return url;
            } catch {
              avatarUrlCache.set(bizId, null);
              return null;
            } finally {
              pendingRequests.delete(bizId);
            }
          })();

          pendingRequests.set(bizId, promise);
          const url = await promise;

          if (url && mounted) {
            avatarMap.value = new Map(avatarMap.value).set(bizId, url);
          }
        }),
      );
    }
  };

  watch(stableKey, load, { immediate: true });
  onUnmounted(() => {
    mounted = false;
  });

  return { avatarMap };
};
