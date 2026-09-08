<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { get_announcement_list } from "@workspace/services";
import type { AnnouncementVO } from "@workspace/types";
import AnnouncementModal from "@/components/AnnouncementModal.vue";
import { useAnnouncementStore } from "@/stores/announcement";

const { ignored } = useAnnouncementStore();
const list = ref<AnnouncementVO[]>([]);
const index = ref(0);
const active = ref<AnnouncementVO | null>(null);
const showModal = ref(false);
let carouselTimer: ReturnType<typeof setInterval> | undefined;

const fetchList = async () => {
  try {
    const res = await get_announcement_list(1, 20);
    list.value = res.list || [];
  } catch (e) {
    console.error("获取公告列表失败:", e);
  }
};

// 过滤掉没有标题且没有内容的空公告，以及已忽略的公告
const visibleList = computed(() =>
  list.value.filter(
    (item) => (item.title || item.content) && !ignored.value.includes(item.uuid)
  )
);

const current = computed(
  () => visibleList.value[index.value % visibleList.value.length]
);

// 多条时定时轮播切换
watch(
  () => visibleList.value.length,
  (len) => {
    clearInterval(carouselTimer);
    if (len > 1) {
      carouselTimer = setInterval(() => {
        index.value = (index.value + 1) % len;
      }, 5000);
    }
  }
);

const open = (item: AnnouncementVO) => {
  active.value = item;
  showModal.value = true;
};

onMounted(() => {
  fetchList();
});

onUnmounted(() => {
  clearInterval(carouselTimer);
});
</script>

<template>
  <div v-if="visibleList.length > 0 && current" class="ann-banner">
    <div class="label">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        />
      </svg>
      <span>公告</span>
    </div>
    <div class="title" :key="current.uuid" @click="open(current)">
      {{ current.title }}
    </div>
  </div>

  <AnnouncementModal v-model:show="showModal" :announcement="active" />
</template>

<style scoped lang="less">
.ann-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--brand-blue-bg);
  border-bottom: 1px solid var(--brand-blue-pale);
  cursor: pointer;

  .label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    background: var(--brand-blue);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    svg {
      width: 13px;
      height: 13px;
    }
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--text-primary);
  }
}
</style>
