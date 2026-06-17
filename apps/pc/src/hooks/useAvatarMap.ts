import { getFiles } from '@workspace/services';
import { useEffect, useRef, useState } from 'react';

// 模块级缓存，跨组件共享
const avatarUrlCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

/**
 * 批量将 bizId 列表转换为可用的 tauri_file_path
 * 带缓存和请求去重
 */
export const useAvatarMap = (bizIds: (string | undefined | null)[]) => {
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());
  const mountedRef = useRef(true);

  // 稳定 key，避免重复请求
  const stableKey = bizIds.filter(Boolean).sort().join(',');

  useEffect(() => {
    mountedRef.current = true;
    const ids = stableKey.split(',').filter(Boolean);
    if (ids.length === 0) return;

    const fetchAvatars = async () => {
      // 先同步已有缓存到 state
      const cached = new Map<string, string>();
      for (const id of ids) {
        if (avatarUrlCache.has(id) && avatarUrlCache.get(id)) {
          cached.set(id, avatarUrlCache.get(id)!);
        }
      }
      if (cached.size > 0 && mountedRef.current) {
        setAvatarMap(new Map(cached));
      }

      // 过滤出需要请求的 bizId
      const needFetch = ids.filter(
        (id) => !avatarUrlCache.has(id) && !pendingRequests.has(id),
      );

      if (needFetch.length === 0) return;

      // 并行获取，每批最多 5 个
      const BATCH_SIZE = 5;
      for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
        if (!mountedRef.current) break;
        const batch = needFetch.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (bizId) => {
            if (!mountedRef.current) return;

            // 复用正在进行的请求
            if (pendingRequests.has(bizId)) {
              const url = await pendingRequests.get(bizId)!;
              if (url && mountedRef.current) {
                setAvatarMap((prev) => new Map(prev).set(bizId, url));
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

            if (url && mountedRef.current) {
              setAvatarMap((prev) => new Map(prev).set(bizId, url));
            }
          }),
        );
      }
    };

    fetchAvatars();

    return () => {
      mountedRef.current = false;
    };
  }, [stableKey]);

  return { avatarMap };
};
