<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import { Popup, Loading } from "vant";
import type { AnnouncementVO } from "@workspace/types";
import { useAuthStore } from "@/stores/auth";
import { useAnnouncementStore } from "@/stores/announcement";
import { formatMomentTime } from "@/utils/time";
import AnnouncementModal from "@/components/AnnouncementModal.vue";

const route = useRoute();
const { isLoggedIn } = useAuthStore();
const {
  visibleList,
  unreadCount,
  active,
  showList,
  showDetail,
  loading,
  fetchList,
  openList,
  openDetail,
  closeList,
  closeDetail,
  reset,
} = useAnnouncementStore();

// 每次登录会话只自动弹出一次
let autoFired = false;

const isMainTab = (path: string) =>
  ["/chats", "/friends", "/plaza", "/profile"].includes(path);

const maybeAutoShow = async () => {
  if (autoFired) return;
  if (!isLoggedIn.value) return;
  if (!isMainTab(route.path)) return;
  autoFired = true;
  await fetchList();
  if (unreadCount.value > 0) {
    openList();
  }
};

const onListShowChange = (v: boolean) => {
  if (!v) closeList();
};

const onOpenDetail = (item: AnnouncementVO) => {
  // 乐观置为已读，保证关闭后红点/列表状态即时一致(服务端由弹窗内上报)
  item.is_read = true;
  openDetail(item);
};

const onDetailShowChange = (v: boolean) => {
  if (!v) closeDetail();
};

watch(
  () => [isLoggedIn.value, route.path],
  () => {
    maybeAutoShow().catch(() => {});
  },
  { immediate: true }
);

watch(isLoggedIn, (v) => {
  if (!v) {
    autoFired = false;
    reset();
  }
});
</script>

<template>
  <Popup
    :show="showList"
    :round="true"
    position="bottom"
    teleport="body"
    :style="{ maxHeight: '75vh' }"
    @update:show="onListShowChange"
  >
    <div class="ann-list">
      <div class="list-header">
        <div class="list-title">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
          <span>系统公告</span>
        </div>
        <span v-if="unreadCount > 0" class="list-unread"
          >{{ unreadCount }} 条未读</span
        >
      </div>

      <Loading v-if="loading" class="list-load" size="20" />
      <div v-else-if="visibleList.length === 0" class="list-empty">
        暂无公告
      </div>
      <div v-else class="list-body">
        <div
          v-for="item in visibleList"
          :key="item.uuid"
          class="list-item"
          :class="{ read: item.is_read }"
          @click="onOpenDetail(item)"
        >
          <div class="item-dot" :class="{ unread: !item.is_read }" />
          <div class="item-main">
            <div class="item-title">{{ item.title || "系统公告" }}</div>
            <div class="item-time">{{ formatMomentTime(item.created_at) }}</div>
          </div>
          <svg class="item-arrow" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
            />
          </svg>
        </div>
      </div>

      <div class="list-footer">
        <button class="confirm-btn" @click="closeList">我知道了</button>
      </div>
    </div>
  </Popup>

  <AnnouncementModal
    :show="showDetail"
    :announcement="active"
    @update:show="onDetailShowChange"
  />
</template>

<style scoped lang="less">
.ann-list {
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 16px 10px;
  flex-shrink: 0;

  .list-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);

    svg {
      width: 20px;
      height: 20px;
      color: var(--brand-blue);
    }
  }

  .list-unread {
    font-size: 12px;
    color: #fff;
    background: var(--brand-blue);
    border-radius: var(--radius-full);
    padding: 2px 10px;
    font-weight: 500;
  }
}

.list-load {
  margin: 24px auto;
}

.list-empty {
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
  color: var(--text-tertiary);
}

.list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 4px;
  -webkit-overflow-scrolling: touch;
}

.list-footer {
  flex-shrink: 0;
  padding: 10px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-light);

  .confirm-btn {
    width: 100%;
    height: 42px;
    border: none;
    border-radius: var(--radius-full);
    background: var(--gradient-primary);
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    &:active {
      opacity: 0.9;
    }
  }
}

.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  &:active {
    background: var(--surface-hover);
  }
  &:last-child {
    border-bottom: none;
  }

  .item-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--border-medium);
    &.unread {
      background: var(--brand-blue);
      box-shadow: 0 0 0 3px var(--brand-blue-bg);
    }
  }

  .item-main {
    flex: 1;
    min-width: 0;

    .item-title {
      font-size: 15px;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-time {
      margin-top: 3px;
      font-size: 12px;
      color: var(--text-tertiary);
    }
  }

  .item-arrow {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  &.read {
    .item-title {
      color: var(--text-secondary);
    }
  }
}
</style>
