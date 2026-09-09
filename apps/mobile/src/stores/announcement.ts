import { ref, computed } from "vue";
import { get_announcement_list } from "@workspace/services";
import type { AnnouncementVO } from "@workspace/types";

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

const list = ref<AnnouncementVO[]>([]);
const active = ref<AnnouncementVO | null>(null);
const showList = ref(false);
const showDetail = ref(false);
const loading = ref(false);

// 过滤掉没有标题且没有内容的空公告，以及已忽略的公告
const isUsable = (item: AnnouncementVO) =>
  Boolean(item.title || item.content) && !ignored.value.includes(item.uuid);

const visibleList = computed(() => list.value.filter(isUsable));

// 未读公告数(铃铛红点)
const unreadCount = computed(
  () => visibleList.value.filter((i) => !i.is_read).length
);

const fetchList = async () => {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await get_announcement_list(1, 20);
    list.value = res.list || [];
  } catch (e) {
    console.error("获取公告列表失败:", e);
  } finally {
    loading.value = false;
  }
};

const openList = () => {
  showList.value = true;
};

const closeList = () => {
  showList.value = false;
};

const openDetail = (item: AnnouncementVO) => {
  active.value = item;
  showDetail.value = true;
};

const closeDetail = () => {
  showDetail.value = false;
  active.value = null;
};

const closeAll = () => {
  showDetail.value = false;
  showList.value = false;
  active.value = null;
};

const reset = () => {
  list.value = [];
  active.value = null;
  showList.value = false;
  showDetail.value = false;
};

export const useAnnouncementStore = () => ({
  ignored,
  ignore,
  visibleList,
  unreadCount,
  active,
  showList,
  showDetail,
  loading,
  fetchList,
  openList,
  closeList,
  openDetail,
  closeDetail,
  closeAll,
  reset,
});
