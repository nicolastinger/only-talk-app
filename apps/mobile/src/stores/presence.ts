import { computed, reactive } from "vue";
import {
  get_friend_presence_batch,
  get_my_presence,
  set_my_presence,
} from "@workspace/services";
import type {
  FriendPresenceMap,
  PresenceMode,
  PresenceVO,
} from "@workspace/types";

/**
 * 用户手动状态(忙碌 / 离开 / 学习中 / 奋斗中 / 自定义)。
 *
 * 服务端只存 Redis(48 小时 TTL), 不落库; 与在线离线无关, 仅好友可见。
 */
interface PresenceState {
  myPresence: PresenceVO | null;
  friendPresence: FriendPresenceMap;
  loadingMy: boolean;
}

const state = reactive<PresenceState>({
  myPresence: null,
  friendPresence: {},
  loadingMy: false,
});

/** 统一小写键, 便于按 uuid 直接取 */
const normalizeMap = (map: FriendPresenceMap): FriendPresenceMap => {
  const normalized: FriendPresenceMap = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    normalized[key.toLowerCase()] = value;
  });
  return normalized;
};

/** 状态是否已过期(客户端兜底) */
export const isPresenceExpired = (presence?: PresenceVO | null): boolean =>
  !!presence && presence.expires_at > 0 && presence.expires_at <= Date.now();

export const usePresenceStore = () => {
  const loadMyPresence = async () => {
    if (state.loadingMy) return;
    state.loadingMy = true;
    try {
      state.myPresence = await get_my_presence();
    } catch (e) {
      console.error("[presence] 读取自己的状态失败", e);
    } finally {
      state.loadingMy = false;
    }
  };

  const loadFriendPresence = async (
    uuids: string[],
    mode: "replace" | "merge" = "replace"
  ) => {
    const targets = Array.from(new Set((uuids || []).filter(Boolean)));
    if (targets.length === 0) {
      if (mode === "replace") state.friendPresence = {};
      return;
    }
    try {
      const map = normalizeMap(await get_friend_presence_batch(targets));
      if (mode === "replace") {
        state.friendPresence = map;
        return;
      }
      // 合并前先移除本次查询的 key, 便于"对方清除状态"后也能消失
      targets.forEach((uuid) => {
        delete state.friendPresence[uuid.toLowerCase()];
      });
      state.friendPresence = { ...state.friendPresence, ...map };
    } catch (e) {
      console.error("[presence] 读取好友状态失败", e);
    }
  };

  const updateMyPresence = async (mode: PresenceMode, text?: string) => {
    const vo = await set_my_presence(mode, text);
    state.myPresence = vo;
    return vo;
  };

  /** 取某人的状态(无状态返回 undefined) */
  const presenceOf = (uuid?: string | null): PresenceVO | undefined =>
    uuid ? state.friendPresence[uuid.toLowerCase()] : undefined;

  return {
    state,
    myPresence: computed(() => state.myPresence),
    friendPresence: computed(() => state.friendPresence),
    presenceOf,
    loadMyPresence,
    loadFriendPresence,
    updateMyPresence,
  };
};
