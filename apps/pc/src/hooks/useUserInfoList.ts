import { get_user_info_with_cache, refresh_user_info } from '@workspace/services';
import { UserInfo } from '@workspace/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 批量获取用户信息
 * 1. 先去本地 common.db (SQLite) 查询用户信息
 * 2. 本地获取不到再通过 API 获取
 * 3. API 获取后自动缓存到本地
 *
 * 模式参考：好友列表 get_friend_list 返回完整用户信息（来自本地 DB）
 * 群成员列表从远端获取只有 user_id，需要用此 hook 补齐 username/icon 等信息
 */
export const useUserInfoList = (uuids: string[]) => {
  const [userInfoMap, setUserInfoMap] = useState<Map<string, UserInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set());

  // 去重排序，生成稳定 key
  const stableKey = [...new Set(uuids.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const targetUuids = stableKey.split(',').filter(Boolean);

    if (targetUuids.length === 0) return;

    let cancelled = false;

    const fetchBatch = async () => {
      setLoading(true);

      // 过滤掉已经成功获取的 UUID，避免重复请求
      const needFetch = targetUuids.filter(uuid => {
        // 如果全局缓存已有，先同步到 state
        if (memberInfoCache.has(uuid)) {
          if (!cancelled) {
            setUserInfoMap(new Map(memberInfoCache));
          }
          return false;
        }
        return !fetchingRef.current.has(uuid);
      });

      if (needFetch.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      // 并行批量获取，每批最多 5 个并发
      const BATCH_SIZE = 5;
      for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = needFetch.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (uuid) => {
            if (cancelled) return;
            if (fetchingRef.current.has(uuid)) return;

            fetchingRef.current.add(uuid);

            try {
              // get_user_info_with_cache: 先查本地 common.db → 未命中则调 API → 缓存到本地
              const result = await get_user_info_with_cache(uuid);

              memberInfoCache.set(uuid, result.user_info);

              if (!cancelled) {
                setUserInfoMap(new Map(memberInfoCache));
              }

              // 如果来自缓存，后台静默刷新以保持数据新鲜
              if (result.from_cache) {
                refresh_user_info(uuid)
                  .then((freshUser) => {
                    memberInfoCache.set(uuid, freshUser);
                    if (!cancelled) {
                      setUserInfoMap(new Map(memberInfoCache));
                    }
                  })
                  .catch(() => {});
              }
            } catch (err) {
              console.error('[useUserInfoList] 获取用户信息失败:', uuid, err);
              // 标记失败的不再重试（本生命周期内）
            }
          })
        );
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    fetchBatch();

    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  // 同步获取缓存的用户信息（不触发请求）
  const getCached = useCallback(
    (uuid: string): UserInfo | undefined => {
      return userInfoMap.get(uuid) || memberInfoCache.get(uuid);
    },
    [userInfoMap],
  );

  return { userInfoMap, loading, getCached };
};

// 模块级缓存，跨组件共享，避免重复请求
const memberInfoCache = new Map<string, UserInfo>();
