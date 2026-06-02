import { useCallback, useEffect, useRef, useState } from 'react';
import { get_user_info_with_cache, refresh_user_info } from '@workspace/services';
import { UserInfo } from '@workspace/types';

const memberInfoCache = new Map<string, UserInfo>();

export const useGroupMemberInfo = (uuids: string[]) => {
  const [memberInfoMap, setMemberInfoMap] = useState<Map<string, UserInfo>>(new Map());
  const [, setVersion] = useState(0);
  const fetchingRef = useRef<Set<string>>(new Set());

  const stableKey = [...new Set(uuids.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const targetUuids = stableKey.split(',').filter(Boolean);

    if (targetUuids.length === 0) return;

    let cancelled = false;

    const doFetch = async () => {
      for (const uuid of targetUuids) {
        if (cancelled) return;
        if (fetchingRef.current.has(uuid)) continue;

        fetchingRef.current.add(uuid);

        try {
          const result = await get_user_info_with_cache(uuid);

          memberInfoCache.set(uuid, result.user_info);

          if (!cancelled) {
            setMemberInfoMap(new Map(memberInfoCache));
            setVersion((v) => v + 1);
          }

          if (result.from_cache) {
            refresh_user_info(uuid)
              .then((freshUser) => {
                memberInfoCache.set(uuid, freshUser);
                if (!cancelled) {
                  setMemberInfoMap(new Map(memberInfoCache));
                  setVersion((v) => v + 1);
                }
              })
              .catch(() => {});
          }
        } catch (err) {
          console.error('[useGroupMemberInfo] 获取成员信息失败:', uuid, err);
        }
      }
    };

    doFetch();

    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  const getCached = useCallback(
    (uuid: string): UserInfo | undefined => {
      return memberInfoMap.get(uuid) || memberInfoCache.get(uuid);
    },
    [memberInfoMap],
  );

  return { memberInfoMap, getCached };
};
