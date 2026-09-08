import { ref } from "vue";

const KEY = "ignoredAnnouncements";

function load(): string[] {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

const ignored = ref<string[]>(load());

const ignore = (uuid: string) => {
  if (ignored.value.includes(uuid)) return;
  ignored.value = [...ignored.value, uuid];
  try {
    localStorage.setItem(KEY, JSON.stringify(ignored.value));
  } catch {
    // 忽略 localStorage 异常（隐私模式等）
  }
};

export const useAnnouncementStore = () => ({ ignored, ignore });
