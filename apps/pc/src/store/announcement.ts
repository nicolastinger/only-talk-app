import { create } from 'zustand';

const KEY = 'ignoredAnnouncements';

function load(): string[] {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

interface AnnouncementState {
  ignored: string[];
  ignore: (uuid: string) => void;
}

export const useAnnouncementStore = create<AnnouncementState>()((set) => ({
  ignored: load(),
  ignore: (uuid) =>
    set((state) => {
      if (state.ignored.includes(uuid)) return state;
      const ignored = [...state.ignored, uuid];
      localStorage.setItem(KEY, JSON.stringify(ignored));
      return { ignored };
    }),
}));
