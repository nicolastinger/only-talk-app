import { computed, onUnmounted, ref, watch } from 'vue';
import {
  get_user_info_with_cache,
  refresh_user_info,
} from '@workspace/services';
import type { UserInfo } from '@workspace/types';

const memberInfoCache = new Map<string, UserInfo>();

export const useGroupMemberInfo = (uuids: string[]) => {
  const memberInfoMap = ref<Map<string, UserInfo>>(new Map());
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
        memberInfoMap.value = new Map(memberInfoCache);
      }
      if (result.from_cache) {
        refresh_user_info(uuid)
          .then((freshUser) => {
            memberInfoCache.set(uuid, freshUser);
            if (!cancelled) {
              memberInfoMap.value = new Map(memberInfoCache);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[useGroupMemberInfo] 获取成员信息失败:', uuid, err);
    }
  };

  const load = async () => {
    const targetUuids = stableKey.value.split(',').filter(Boolean);
    if (targetUuids.length === 0) return;
    for (const uuid of targetUuids) {
      if (cancelled) return;
      await fetchOne(uuid);
    }
  };

  watch(stableKey, load, { immediate: true });
  onUnmounted(() => {
    cancelled = true;
  });

  const getCached = (uuid: string): UserInfo | undefined =>
    memberInfoMap.value.get(uuid) || memberInfoCache.get(uuid);

  return { memberInfoMap, getCached };
};
