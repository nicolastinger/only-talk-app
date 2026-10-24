import { kv_get, kv_set } from '@workspace/services';
import { create } from 'zustand';

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

export const useAnnouncementStore = create<AnnouncementState>()((set) => {
  kv_get(KEY)
    .then((v) => {
      if (v) {
        try {
          set({ ignored: JSON.parse(v) as string[] });
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {});

  const persist = (ignored: string[]) => {
    kv_set(KEY, JSON.stringify(ignored)).catch(() => {});
    return { ignored };
  };

  return {
    ignored: [],
    ignore: (uuid) =>
      set((state) => {
        if (state.ignored.includes(uuid)) return state;
        return persist([...state.ignored, uuid]);
      }),
    restore: (uuid) =>
      set((state) => {
        if (!state.ignored.includes(uuid)) return state;
        return persist(state.ignored.filter((item) => item !== uuid));
      }),
    restoreAll: () =>
      set((state) => (state.ignored.length === 0 ? state : persist([]))),
  };
});
