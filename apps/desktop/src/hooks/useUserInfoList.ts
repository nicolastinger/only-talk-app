import { computed, onUnmounted, ref, watch } from 'vue';
import {
  get_user_info_with_cache,
  refresh_user_info,
} from '@workspace/services';
import type { UserInfo } from '@workspace/types';

// 模块级缓存，跨组件共享，避免重复请求
const memberInfoCache = new Map<string, UserInfo>();

/**
 * 批量获取用户信息
 * 1. 先去本地 common.db (SQLite) 查询用户信息
 * 2. 本地获取不到再通过 API 获取
 * 3. API 获取后自动缓存到本地
 */
export const useUserInfoList = (uuids: string[]) => {
  const userInfoMap = ref<Map<string, UserInfo>>(new Map());
  const loading = ref(false);
  const fetching = new Set<string>();
  let cancelled = false;

  const stableKey = computed(() =>
    [...new Set(uuids.filter(Boolean))].sort().join(','),
  );

  const fetchOne = async (uuid: string) => {
    if (cancelled || fetching.has(uuid)) return;
    fetching.add(uuid);
    try {
      const result = await get_user_info_with_cache(uuid);
      memberInfoCache.set(uuid, result.user_info);
      if (!cancelled) {
        userInfoMap.value = new Map(memberInfoCache);
      }
      if (result.from_cache) {
        refresh_user_info(uuid)
          .then((freshUser) => {
            memberInfoCache.set(uuid, freshUser);
            if (!cancelled) {
              userInfoMap.value = new Map(memberInfoCache);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[useUserInfoList] 获取用户信息失败:', uuid, err);
    }
  };

  const load = async () => {
    const targetUuids = stableKey.value.split(',').filter(Boolean);
    if (targetUuids.length === 0) return;

    loading.value = true;
    const needFetch = targetUuids.filter((uuid) => {
      if (memberInfoCache.has(uuid)) {
        if (!cancelled) {
          userInfoMap.value = new Map(memberInfoCache);
        }
        return false;
      }
      return !fetching.has(uuid);
    });

    if (needFetch.length === 0) {
      loading.value = false;
      return;
    }

    const BATCH_SIZE = 5;
    for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
      if (cancelled) break;
      await Promise.all(needFetch.slice(i, i + BATCH_SIZE).map(fetchOne));
    }
    if (!cancelled) loading.value = false;
  };

  watch(stableKey, load, { immediate: true });
  onUnmounted(() => {
    cancelled = true;
  });

  const getCached = (uuid: string): UserInfo | undefined =>
    userInfoMap.value.get(uuid) || memberInfoCache.get(uuid);

  return { userInfoMap, loading, getCached };
};
