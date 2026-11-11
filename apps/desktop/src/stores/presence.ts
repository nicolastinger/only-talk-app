import { reactive } from 'vue';
import {
  get_friend_presence_batch,
  get_my_presence,
  set_my_presence,
} from '@workspace/services';
import type {
  FriendPresenceMap,
  PresenceMode,
  PresenceVO,
} from '@workspace/types';

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
  loadMyPresence: (force?: boolean) => Promise<void>;
  loadFriendPresence: (
    uuids: string[],
    mode?: FriendPresenceLoadMode,
  ) => Promise<void>;
  updateMyPresence: (mode: PresenceMode, text?: string) => Promise<PresenceVO>;
}

const state = reactive<PresenceState>({
  myPresence: null,
  friendPresence: {},
  loadingMy: false,

  loadMyPresence: async (force = false) => {
    // 顶栏按钮随 hover 反复挂载, 15s 内的重复读取直接复用内存值
    const now = Date.now();
    if (!force && now - lastMyPresenceLoadedAt < 15_000) return;
    if (state.loadingMy) return;
    state.loadingMy = true;
    try {
      state.myPresence = await get_my_presence();
      lastMyPresenceLoadedAt = Date.now();
    } catch (e) {
      console.log('[presence] 读取自己的状态失败', e);
    } finally {
      state.loadingMy = false;
    }
  },

  loadFriendPresence: async (uuids, mode = 'replace') => {
    const targets = Array.from(new Set(uuids.filter(Boolean)));
    if (targets.length === 0) {
      if (mode === 'replace') state.friendPresence = {};
      return;
    }
    try {
      const map = await get_friend_presence_batch(targets);
      // 服务端返回的 uuid 为小写; 统一小写键, 便于各处直接按 friend_id 取
      const normalized: FriendPresenceMap = {};
      Object.entries(map).forEach(([key, value]) => {
        normalized[key.toLowerCase()] = value;
      });
      if (mode === 'replace') {
        state.friendPresence = normalized;
        return;
      }
      // 合并前先移除本次查询的 key, 这样"对方清除状态"也能正确消失
      const next: FriendPresenceMap = { ...state.friendPresence };
      targets.forEach((uuid) => {
        delete next[uuid.toLowerCase()];
      });
      state.friendPresence = { ...next, ...normalized };
    } catch (e) {
      console.log('[presence] 读取好友状态失败', e);
    }
  },

  updateMyPresence: async (mode, text) => {
    const vo = await set_my_presence(mode, text);
    state.myPresence = vo;
    return vo;
  },
});

/** 兼容 React 版 usePresenceStore() 调用方式 */
export const usePresenceStore = () => state;

/** 状态是否已过期(客户端兜底: 服务端已按 TTL 清理, 这里防时钟/缓存残留) */
export const isPresenceExpired = (presence?: PresenceVO | null): boolean =>
  !!presence && presence.expires_at > 0 && presence.expires_at <= Date.now();
