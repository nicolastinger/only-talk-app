<script setup lang="ts">
import { ref, onMounted } from "vue";
import { PullRefresh, Loading, Empty } from "vant";
import { get_moment_list } from "@workspace/services";
import type { MomentVo } from "@workspace/types";
import MomentCard from "./MomentCard.vue";

const props = defineProps<{ feed: "plaza" | "following" | "mine" }>();

const PAGE_SIZE = 10;
const list = ref<MomentVo[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);

const emptyTextMap: Record<string, string> = {
  plaza: "广场还没有人发布动态",
  following: "还没有关注的动态，去关注感兴趣的人吧",
  mine: "你还没有发布过动态",
};

const loadMore = async () => {
  if (loading.value || finished.value) return;
  loading.value = true;
  try {
    const result = await get_moment_list(page.value, PAGE_SIZE, {
      feed: props.feed,
    });
    total.value = result.total;
    list.value = list.value.concat(result.list);
    page.value += 1;
    if (list.value.length >= total.value) finished.value = true;
  } catch (e) {
    console.error("加载动态失败", e);
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  page.value = 1;
  list.value = [];
  total.value = 0;
  finished.value = false;
  await loadMore();
};

const onRefresh = async () => {
  refreshing.value = true;
  await refresh();
  refreshing.value = false;
};

const onRemoved = (uuid: string) => {
  list.value = list.value.filter((m) => m.uuid !== uuid);
  if (list.value.length >= total.value) finished.value = true;
};

onMounted(refresh);
</script>

<template>
  <PullRefresh
    v-model="refreshing"
    :head-height="60"
    pulling-text="下拉刷新"
    loosing-text="释放刷新"
    loading-text="加载中..."
    @refresh="onRefresh"
  >
    <div class="feed">
      <div v-if="loading && list.length === 0" class="state-box">
        <Loading size="28">加载中...</Loading>
      </div>

      <div v-else-if="list.length === 0" class="state-box">
        <Empty :description="emptyTextMap[feed]">
          <template #image>
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              style="width: 80px; height: 80px; color: var(--border-medium)"
            >
              <path
                d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
              />
            </svg>
          </template>
        </Empty>
      </div>

      <template v-else>
        <div class="m-list">
          <MomentCard
            v-for="m in list"
            :key="m.uuid"
            :moment="m"
            @removed="onRemoved"
          />
        </div>
        <div v-if="!finished" class="load-more">
          <button class="more-btn" :disabled="loading" @click="loadMore">
            {{ loading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </template>
    </div>
  </PullRefresh>
</template>

<style scoped lang="less">
.feed {
  min-height: 40vh;
}

.state-box {
  padding: 50px 0;
  display: flex;
  justify-content: center;
}

.m-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.load-more {
  margin: 16px 0 4px;
  text-align: center;
}

.more-btn {
  height: 40px;
  padding: 0 34px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}
</style>
