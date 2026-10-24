import {
  get_friend_presence_batch,
  get_my_presence,
  set_my_presence,
} from '@workspace/services';
import { FriendPresenceMap, PresenceMode, PresenceVO } from '@workspace/types';
import { create } from 'zustand';

/** 好友状态的加载方式: replace 覆盖(列表整体刷新) / merge 合并(单个资料卡补充) */
export type FriendPresenceLoadMode = 'replace' | 'merge';

/** 自己状态的上次读取时间(毫秒), 用于顶栏 hover 反复挂载时的节流 */
let lastMyPresenceLoadedAt = 0;

interface PresenceState {
  /** 自己的状态; null = 尚未加载 */
  myPresence: PresenceVO | null;
  /** 好友状态: uuid -> 状态(无状态的好友不出现) */
  friendPresence: FriendPresenceMap;
  loadingMy: boolean;
  /** 读取自己的手动状态(force=true 跳过 15s 节流) */
  loadMyPresence: (force?: boolean) => Promise<void>;
  /** 批量读取好友状态 */
  loadFriendPresence: (
    uuids: string[],
    mode?: FriendPresenceLoadMode,
  ) => Promise<void>;
  /** 设置/清除自己的状态(mode=online 表示清除) */
  updateMyPresence: (mode: PresenceMode, text?: string) => Promise<PresenceVO>;
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  myPresence: null,
  friendPresence: {},
  loadingMy: false,

  loadMyPresence: async (force = false) => {
    // 顶栏按钮随 hover 反复挂载, 15s 内的重复读取直接复用内存值
    const now = Date.now();
    if (!force && now - lastMyPresenceLoadedAt < 15_000) return;
    if (get().loadingMy) return;
    set({ loadingMy: true });
    try {
      const vo = await get_my_presence();
      set({ myPresence: vo });
      lastMyPresenceLoadedAt = Date.now();
    } catch (e) {
      console.log('[presence] 读取自己的状态失败', e);
    } finally {
      set({ loadingMy: false });
    }
  },

  loadFriendPresence: async (uuids, mode = 'replace') => {
    const targets = Array.from(new Set(uuids.filter(Boolean)));
    if (targets.length === 0) {
      if (mode === 'replace') set({ friendPresence: {} });
      return;
    }
    try {
      const map = await get_friend_presence_batch(targets);
      // 服务端返回的 uuid 为小写; 统一小写键, 便于各处直接按 friend_id 取
      const normalized: FriendPresenceMap = {};
      Object.entries(map).forEach(([key, value]) => {
        normalized[key.toLowerCase()] = value;
      });
      set((state) => {
        if (mode === 'replace') return { friendPresence: normalized };
        // 合并前先移除本次查询的 key, 这样"对方清除状态"也能正确消失
        const next: FriendPresenceMap = { ...state.friendPresence };
        targets.forEach((uuid) => {
          delete next[uuid.toLowerCase()];
        });
        return { friendPresence: { ...next, ...normalized } };
      });
    } catch (e) {
      console.log('[presence] 读取好友状态失败', e);
    }
  },

  updateMyPresence: async (mode, text) => {
    const vo = await set_my_presence(mode, text);
    set({ myPresence: vo });
    return vo;
  },
}));

/** 状态是否已过期(客户端兜底: 服务端已按 TTL 清理, 这里防时钟/缓存残留) */
export const isPresenceExpired = (presence?: PresenceVO | null): boolean =>
  !!presence && presence.expires_at > 0 && presence.expires_at <= Date.now();
