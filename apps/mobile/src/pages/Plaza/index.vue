<script setup lang="ts">
import { ref } from "vue";
import type { Component } from "vue";
import { useRouter } from "vue-router";
import { useUnreadStore } from "@/stores/unread";
import NotificationBell from "@/components/NotificationBell/index.vue";
import FeedSquare from "./feed/FeedSquare.vue";
import FeedFollowing from "./feed/FeedFollowing.vue";
import FeedMine from "./feed/FeedMine.vue";

interface RailItem {
  key: string;
  label: string;
}

const railMenus: RailItem[] = [
  { key: "square", label: "广场" },
  { key: "following", label: "关注" },
  { key: "mine", label: "我的" },
];

const activeKey = ref("square");

const router = useRouter();

const onSubTab = (key: string) => {
  activeKey.value = key;
};

const feedFeatures: Record<string, Component> = {
  square: FeedSquare,
  following: FeedFollowing,
  mine: FeedMine,
};

// 动态广场"本页通知"入口, 复用 /notifications 单类型模式
const { momentUnread } = useUnreadStore();
const goNotifications = () => router.push("/notifications?type=moments");
</script>

<template>
  <div class="feed-page">
    <div class="header">
      <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
        />
      </svg>
      <span class="page-title">动态</span>
      <NotificationBell :count="momentUnread" @click="goNotifications" />
      <button class="header-link" @click="router.push('/plaza/friend')">
        <svg class="header-link-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
          />
        </svg>
        <span>交友</span>
      </button>
    </div>

    <div class="feed-body">
      <div class="sub-tabs">
        <button
          v-for="item in railMenus"
          :key="item.key"
          class="sub-tab"
          :class="{ active: activeKey === item.key }"
          @click="onSubTab(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <section class="content">
        <component :is="feedFeatures[activeKey]" :key="`feed-${activeKey}`" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="less">
.feed-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 80px;
}

.header {
  padding: max(12px, env(safe-area-inset-top)) 20px 12px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title-icon {
  width: 26px;
  height: 26px;
  color: var(--brand-blue);
  flex-shrink: 0;
  display: block;
}

.page-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-link {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  box-shadow: var(--shadow-xs);

  &:active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
  }

  &-icon {
    width: 15px;
    height: 15px;
  }
}

.feed-body {
  padding: 12px 16px 0;
}

.sub-tabs {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.sub-tab {
  flex-shrink: 0;
  height: 32px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  box-shadow: var(--shadow-xs);

  &.active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }
}

.content {
  padding-top: 2px;
}
</style>
