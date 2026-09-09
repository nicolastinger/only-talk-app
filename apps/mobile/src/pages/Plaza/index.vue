<script setup lang="ts">
import { ref, computed } from "vue";
import type { Component } from "vue";
import FriendSquare from "./friend/FriendSquare.vue";
import FriendSwipe from "./friend/FriendSwipe.vue";
import FriendCrush from "./friend/FriendCrush.vue";
import FriendMatch from "./friend/FriendMatch.vue";
import FeedSquare from "./feed/FeedSquare.vue";
import FeedFollowing from "./feed/FeedFollowing.vue";
import FeedMine from "./feed/FeedMine.vue";

type TopTab = "friend" | "feed";

interface RailItem {
  key: string;
  label: string;
}

const topLabelMap: Record<TopTab, string> = {
  friend: "交友",
  feed: "动态",
};

const topTabs: TopTab[] = ["friend", "feed"];

const railMenus: Record<TopTab, RailItem[]> = {
  friend: [
    { key: "square", label: "广场" },
    { key: "swipe", label: "速配" },
    { key: "crush", label: "我心动" },
    { key: "match", label: "已匹配" },
  ],
  feed: [
    { key: "square", label: "广场" },
    { key: "following", label: "关注" },
    { key: "mine", label: "我的" },
  ],
};

const topTab = ref<TopTab>("friend");
const activeKey = ref("square");

const currentMenu = computed(() => railMenus[topTab.value]);

const onTopTab = (tab: TopTab) => {
  topTab.value = tab;
  activeKey.value = railMenus[tab][0].key;
};

const onSubTab = (key: string) => {
  activeKey.value = key;
};

const friendFeatures: Record<string, Component> = {
  square: FriendSquare,
  swipe: FriendSwipe,
  crush: FriendCrush,
  match: FriendMatch,
};

const feedFeatures: Record<string, Component> = {
  square: FeedSquare,
  following: FeedFollowing,
  mine: FeedMine,
};
</script>

<template>
  <div class="plaza-page">
    <div class="header">
      <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        />
      </svg>
      <div class="top-tabs">
        <button
          v-for="key in topTabs"
          :key="key"
          class="top-tab"
          :class="{ active: topTab === key }"
          @click="onTopTab(key)"
        >
          {{ topLabelMap[key] }}
        </button>
      </div>
    </div>

    <div class="plaza-body">
      <div class="sub-tabs">
        <button
          v-for="item in currentMenu"
          :key="item.key"
          class="sub-tab"
          :class="{ active: activeKey === item.key }"
          @click="onSubTab(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <section class="content">
        <component
          v-if="topTab === 'friend'"
          :is="friendFeatures[activeKey]"
          :key="`friend-${activeKey}`"
        />
        <component
          v-else
          :is="feedFeatures[activeKey]"
          :key="`feed-${activeKey}`"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="less">
.plaza-page {
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
}

.top-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.top-tab {
  width: 64px;
  height: 32px;
  border: none;
  border-radius: calc(var(--radius-lg) - 4px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;

  &.active {
    background: var(--gradient-primary);
    color: #fff;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }
}

.plaza-body {
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
