import { reactive } from 'vue';
import { kv_get, kv_set } from '@workspace/services';

const KEY = 'ui_ignored_announcements';

interface AnnouncementState {
  /** 已忽略的公告 uuid 列表（会话级内存 KV，重启/登出后清空） */
  ignored: string[];
  /** 忽略一条公告 */
  ignore: (uuid: string) => void;
  /** 撤销忽略（恢复显示） */
  restore: (uuid: string) => void;
  /** 恢复全部已忽略 */
  restoreAll: () => void;
}

const persist = (ignored: string[]) => {
  kv_set(KEY, JSON.stringify(ignored)).catch(() => {});
  return ignored;
};

export const state = reactive<AnnouncementState>({
  ignored: [],
  ignore: (uuid) => {
    if (state.ignored.includes(uuid)) return;
    state.ignored = persist([...state.ignored, uuid]);
  },
  restore: (uuid) => {
    if (!state.ignored.includes(uuid)) return;
    state.ignored = persist(state.ignored.filter((item) => item !== uuid));
  },
  restoreAll: () => {
    if (state.ignored.length === 0) return;
    state.ignored = persist([]);
  },
});

kv_get(KEY)
  .then((v) => {
    if (!v) return;
    try {
      state.ignored = JSON.parse(v) as string[];
    } catch {
      /* ignore */
    }
  })
  .catch(() => {});

/** 兼容 React 版 useAnnouncementStore() 调用方式 */
export const useAnnouncementStore = () => state;
