<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUnreadStore } from "@/stores/unread";
import NotificationBell from "@/components/NotificationBell/index.vue";
import FriendSquare from "./friend/FriendSquare.vue";
import FriendSwipe from "./friend/FriendSwipe.vue";
import FriendCrush from "./friend/FriendCrush.vue";
import FriendMatch from "./friend/FriendMatch.vue";

interface RailItem {
  key: string;
  label: string;
}

const railMenus: RailItem[] = [
  { key: "square", label: "广场" },
  { key: "swipe", label: "速配" },
  { key: "crush", label: "我心动" },
  { key: "match", label: "已匹配" },
];

const activeKey = ref("square");

const route = useRoute();
const router = useRouter();

// 支持从外部入口(如发现页金刚键)带 sub 参数直达指定子页
onMounted(() => {
  const sub = route.query.sub;
  if (typeof sub === "string" && railMenus.some((item) => item.key === sub)) {
    activeKey.value = sub;
  }
});

const onSubTab = (key: string) => {
  activeKey.value = key;
};

// 交友广场"本页通知"入口, 复用 /notifications 单类型模式
const { plazaUnread } = useUnreadStore();
const goNotifications = () => router.push("/notifications?type=plaza");

const friendFeatures: Record<string, Component> = {
  square: FriendSquare,
  swipe: FriendSwipe,
  crush: FriendCrush,
  match: FriendMatch,
};
</script>

<template>
  <div class="friend-page">
    <div class="header">
      <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        />
      </svg>
      <span class="page-title">交友</span>
      <NotificationBell :count="plazaUnread" @click="goNotifications" />
      <button class="header-link" @click="router.push('/plaza')">
        <svg class="header-link-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M13 3c-4.97 0-9 4.03-9 9H1l4 4 4-4H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.51 0-2.91-.49-4.06-1.3l-1.42 1.44C8.04 20.3 9.94 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"
          />
        </svg>
        <span>动态</span>
      </button>
    </div>

    <div class="friend-body">
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
        <component
          :is="friendFeatures[activeKey]"
          :key="`friend-${activeKey}`"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="less">
.friend-page {
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

.friend-body {
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
