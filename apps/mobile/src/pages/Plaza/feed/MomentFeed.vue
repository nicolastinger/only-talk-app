<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { PullRefresh, Loading, Empty } from "vant";
import {
  get_moment_list,
  get_moment_cache,
  save_moment_cache,
  delete_moment_cache,
  clear_moment_cache,
  prefetchMomentMedia,
} from "@workspace/services";
import type { MomentVo } from "@workspace/types";
import MomentCard from "./MomentCard.vue";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();

const props = defineProps<{ feed: "plaza" | "following" | "mine" }>();

const PAGE_SIZE = 10;
const list = ref<MomentVo[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);

/** 页面卸载后停止后台媒体预下载 */
let disposed = false;

const emptyKeyMap: Record<string, string> = {
  plaza: "plaza.feed.emptyPlaza",
  following: "plaza.feed.emptyFollowing",
  mine: "plaza.feed.emptyMine",
};

/** 后台预下载图片: 不阻塞列表渲染, 失败静默 */
const prefetchMedia = (moments: MomentVo[]) => {
  prefetchMomentMedia(moments, {
    concurrency: 2,
    shouldStop: () => disposed,
  }).catch(() => {});
};

/**
 * 本地缓存优先: 有缓存直接展示, 不请求服务端。
 *
 * 按需求: 有缓存时必须由用户下拉刷新才回源; 因此这里把 `finished` 置 true,
 * 隐藏「加载更多」, 避免用户在缓存态下混入服务端分页。
 */
const loadFromCache = async (): Promise<boolean> => {
  const cached = await get_moment_cache(props.feed);
  if (!cached.length) return false;
  list.value = cached;
  total.value = cached.length;
  page.value = 1;
  finished.value = true;
  prefetchMedia(cached);
  return true;
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
    if (result.list.length) {
      // 缓存与服务端同步: 写入失败只记日志, 不影响展示
      void save_moment_cache(props.feed, result.list);
      prefetchMedia(result.list);
    }
  } catch (e) {
    console.error("加载动态失败", e);
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  const prev = list.value;
  loading.value = true;
  finished.value = false;
  try {
    const result = await get_moment_list(1, PAGE_SIZE, { feed: props.feed });
    list.value = result.list;
    total.value = result.total;
    page.value = 2;
    if (list.value.length >= total.value) finished.value = true;
    if (result.list.length) {
      void save_moment_cache(props.feed, result.list);
      prefetchMedia(result.list);
    } else {
      // 服务端首页为空(如取关后): 清掉缓存, 避免下次进入又展示旧数据
      void clear_moment_cache(props.feed);
    }
  } catch (e) {
    console.error("刷新动态失败", e);
    // 回源失败(离线等)时保留已有列表(通常是本地缓存), 避免白屏
    list.value = prev;
    total.value = prev.length;
    page.value = 1;
    finished.value = true;
  } finally {
    loading.value = false;
  }
};

/** 下拉刷新: 无论是否有缓存都回源拉第一页 */
const onRefresh = async () => {
  refreshing.value = true;
  await refresh();
  refreshing.value = false;
};

const onRemoved = (uuid: string) => {
  list.value = list.value.filter((m) => m.uuid !== uuid);
  if (list.value.length >= total.value) finished.value = true;
  // 同步清掉本地缓存, 避免重启后又出现已删除的动态
  void delete_moment_cache(uuid);
};

/** 首次进入: 有本地缓存直接渲染, 没有才请求服务端首页 */
const initFeed = async () => {
  if (await loadFromCache()) return;
  await refresh();
};

onMounted(initFeed);
onUnmounted(() => {
  disposed = true;
});
</script>

<template>
  <PullRefresh
    v-model="refreshing"
    :head-height="60"
    :pulling-text="t('common.pullDown')"
    :loosing-text="t('common.pullRelease')"
    :loading-text="t('common.loadingDots')"
    @refresh="onRefresh"
  >
    <div class="feed">
      <div v-if="loading && list.length === 0" class="state-box">
        <Loading size="28">{{ t("common.loadingDots") }}</Loading>
      </div>

      <div v-else-if="list.length === 0" class="state-box">
        <Empty :description="t(emptyKeyMap[feed])">
          <template #image>
            <img
              src="@/assets/empty-state.svg"
              class="empty-state-img"
              :alt="t('common.noContent')"
            />
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
            {{ loading ? t("common.loadingDots") : t("common.loadMore") }}
          </button>
        </div>
      </template>
    </div>

    <button
      v-if="feed === 'mine'"
      class="fab"
      :aria-label="t('plaza.feed.compose')"
      @click="router.push('/plaza/moment/create')"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        />
      </svg>
    </button>
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

.empty-state-img {
  width: 120px;
  height: 96px;
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

.fab {
  position: fixed;
  right: 18px;
  bottom: calc(84px + env(safe-area-inset-bottom));
  width: 54px;
  height: 54px;
  border: none;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);

  svg {
    width: 26px;
    height: 26px;
  }

  &:active {
    transform: scale(0.94);
  }
}
</style>
