import { invoke } from "@tauri-apps/api/core";
import type { MomentVo } from "@workspace/types";
import { getFiles, hasLocalChatFile } from "../fileService";

/** 每个 feed 本地缓存的动态条数上限（与 Rust 侧 `MomentCache::MAX_PER_FEED` 一致） */
export const MOMENT_CACHE_LIMIT = 100;

/**
 * 读取本地缓存的动态列表（按动态创建时间倒序）。
 *
 * 读取失败（未登录/库未就绪）返回空数组，调用方按"无缓存"走服务端即可。
 */
export const get_moment_cache = async (feed: string): Promise<MomentVo[]> => {
  try {
    return (await invoke("get_moment_cache", {
      feed,
      limit: MOMENT_CACHE_LIMIT,
    })) as MomentVo[];
  } catch (e) {
    console.error("读取动态缓存失败:", e);
    return [];
  }
};

/**
 * 写入/更新动态列表缓存（按 feed 只保留最近 100 条）。
 *
 * 失败仅记录日志：缓存是加速项，不应影响动态展示。
 */
export const save_moment_cache = async (
  feed: string,
  moments: MomentVo[]
): Promise<void> => {
  if (!moments.length) return;
  try {
    await invoke("save_moment_cache", { feed, moments });
  } catch (e) {
    console.error("写入动态缓存失败:", e);
  }
};

/** 删除单条动态缓存（用户删除动态后调用，避免重启后再次出现）。 */
export const delete_moment_cache = async (uuid: string): Promise<void> => {
  if (!uuid) return;
  try {
    await invoke("delete_moment_cache", { uuid });
  } catch (e) {
    console.error("删除动态缓存失败:", e);
  }
};

/** 清空某个 feed 的缓存（如发布新动态后让「我的」下次强制回源）。 */
export const clear_moment_cache = async (feed: string): Promise<void> => {
  if (!feed) return;
  try {
    await invoke("clear_moment_cache", { feed });
  } catch (e) {
    console.error("清空动态缓存失败:", e);
  }
};

export interface MomentMediaPrefetchOptions {
  /** 并发下载数（默认 2，避免占满移动端带宽） */
  concurrency?: number;
  /** 返回 true 时尽快停止后续下载（页面卸载/切换 feed） */
  shouldStop?: () => boolean;
}

/**
 * 后台预下载缓存动态的图片，实现离线/弱网直接浏览。
 *
 * 媒体复用 `file_record`（`biz_id` = 动态 uuid）：
 * - 已有本地文件（含物理文件存在）直接跳过，不重复下载；
 * - 单条动态下载失败不影响其他动态，仅记录日志。
 *
 * 注意：这是纯后台任务，调用方无需 await（但要处理未捕获异常）。
 */
export const prefetchMomentMedia = async (
  moments: MomentVo[],
  options: MomentMediaPrefetchOptions = {}
): Promise<void> => {
  const queue = moments.filter((m) => m.uuid && (m.image_count || 0) > 0);
  if (!queue.length) return;

  const concurrency = Math.max(1, options.concurrency ?? 2);
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      if (options.shouldStop?.()) return;
      const moment = queue[cursor++];
      try {
        if (await hasLocalChatFile(moment.uuid)) continue;
        if (options.shouldStop?.()) return;
        await getFiles(moment.uuid);
      } catch (e) {
        console.warn("预下载动态图片失败:", moment.uuid, e);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );
};
