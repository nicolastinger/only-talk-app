import { create } from 'zustand';
import { kv_get, kv_set } from '@workspace/services';

const KEY = 'ui_ignored_announcements';

interface AnnouncementState {
  ignored: string[];
  ignore: (uuid: string) => void;
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

  return {
    ignored: [],
    ignore: (uuid) =>
      set((state) => {
        if (state.ignored.includes(uuid)) return state;
        const ignored = [...state.ignored, uuid];
        kv_set(KEY, JSON.stringify(ignored)).catch(() => {});
        return { ignored };
      }),
  };
});
