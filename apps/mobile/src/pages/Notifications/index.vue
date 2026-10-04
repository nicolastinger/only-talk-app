<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { showToast, Tabs, Tab, Badge, Empty, Button } from "vant";
import { clearUnreadByLevel } from "@workspace/services";
import {
  NOTIFICATION_LEVEL2,
  type NotificationCategoryKey,
} from "@workspace/types";
import { useUnreadStore } from "@/stores/unread";
import type { SystemNotification } from "@workspace/types";

const route = useRoute();
const router = useRouter();
const { refresh: refreshUnread } = useUnreadStore();
const goBack = () => router.back();

const notifications = ref<SystemNotification[]>([]);
const loading = ref(false);
const activeTab = ref(0);
let unlisteners: UnlistenFn[] = [];

interface Category {
  key: string;
  label: string;
  level1: number;
  level2?: number;
  clearLevel2: number;
}

const categories: Category[] = [
  { key: "all", label: "全部", level1: 1, level2: undefined, clearLevel2: -1 },
  { key: "friend", label: "好友", level1: 1, level2: 1, clearLevel2: 1 },
  { key: "group", label: "群组", level1: 1, level2: 3, clearLevel2: 3 },
  { key: "plaza", label: "交友", level1: 1, level2: 4, clearLevel2: 4 },
  { key: "moments", label: "动态", level1: 1, level2: 5, clearLevel2: 5 },
];

// 支持外部入口带 type 参数: /notifications?type=friend|group|plaza|moments
// 传入时只展示该分类(单类型模式), 不传则为通知中心全量模式
const categoryKeys = [
  "friend",
  "group",
  "plaza",
  "moments",
] as NotificationCategoryKey[];
const pageType = computed<NotificationCategoryKey | null>(() => {
  const q = route.query.type;
  if (
    typeof q === "string" &&
    categoryKeys.includes(q as NotificationCategoryKey)
  ) {
    return q as NotificationCategoryKey;
  }
  return null;
});

const visibleCategories = computed<Category[]>(() => {
  if (!pageType.value) return categories;
  const level2 = NOTIFICATION_LEVEL2[pageType.value];
  return categories.filter((c) => c.key !== "all" && c.level2 === level2);
});

const pageTitle = computed(() => {
  if (!pageType.value) return "通知中心";
  const labelMap: Record<NotificationCategoryKey, string> = {
    friend: "好友通知",
    group: "群组通知",
    plaza: "交友通知",
    moments: "动态通知",
  };
  return labelMap[pageType.value];
});

/** 单类型模式下当前展示的分类(仅一个) */
const singleCategory = computed<Category>(
  () => visibleCategories.value[0] || categories[0]
);

const TYPE_META: Record<string, { label: string; color: string }> = {
  "1-1-1": { label: "好友申请", color: "#1677ff" },
  "1-1-2": { label: "好友处理", color: "#52c41a" },
  "1-3-1": { label: "群邀请", color: "#fa8c16" },
  "1-3-2": { label: "群信息更新", color: "#13c2c2" },
  "1-3-3": { label: "群成员变动", color: "#722ed1" },
  "1-3-4": { label: "邀请结果", color: "#fa541c" },
  "1-4-1": { label: "心动", color: "#eb2f96" },
  "1-4-2": { label: "互相心动", color: "#f5222d" },
  "1-5-1": { label: "动态点赞", color: "#faad14" },
  "1-5-2": { label: "动态评论", color: "#2f54eb" },
};

const typeMeta = (n: SystemNotification) =>
  TYPE_META[`${n.level1}-${n.level2}-${n.level3}`] || {
    label: "系统通知",
    color: "#8c8c8c",
  };

/** hex 颜色转 rgba, 用于生成柔和底色/阴影 */
const withAlpha = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** 类型图标底色(渐变) */
const iconBg = (color: string) =>
  `linear-gradient(135deg, ${color}, ${withAlpha(color, 0.55)})`;

/** 类型图标阴影 */
const iconShadow = (color: string) => `0 4px 10px ${withAlpha(color, 0.28)}`;

/** 全部未读数(头部徽标) */
const totalUnread = computed(
  () => notifications.value.filter((n) => n.is_read === false).length
);

const getFiltered = (cat: Category) => {
  let list = notifications.value.filter((n) => n.level1 === cat.level1);
  if (cat.level2 !== undefined) {
    list = list.filter((n) => n.level2 === cat.level2);
  }
  return list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
};

const unreadOf = (cat: Category) =>
  getFiltered(cat).filter((n) => n.is_read === false).length;

const formatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes <= 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString();
};

const loadNotifications = async () => {
  try {
    loading.value = true;
    const list = await invoke<SystemNotification[]>("get_system_notification", {
      isRead: null,
    });
    notifications.value = list || [];
  } catch (e) {
    console.error("获取通知列表失败", e);
  } finally {
    loading.value = false;
  }
};

const markRead = async (n: SystemNotification) => {
  if (n.is_read !== false || !n.id) return;
  try {
    await invoke("batch_read_system_notification", { readIds: [n.id] });
    n.is_read = true;
    await refreshUnread();
  } catch (e) {
    console.error("标记已读失败", e);
  }
};

const clearUnread = async (cat: Category) => {
  try {
    await clearUnreadByLevel(cat.level1, cat.clearLevel2, -1, -1);
    await Promise.all([loadNotifications(), refreshUnread()]);
    showToast("已清空未读");
  } catch (e) {
    console.error("清空未读失败", e);
  }
};

const handleNotifyEvent = () => {
  loadNotifications();
  refreshUnread();
};

const setupListeners = async () => {
  unlisteners.push(await listen("listen_notify_msg", handleNotifyEvent));
  unlisteners.push(await listen("listen_notify_read", handleNotifyEvent));
};

onMounted(() => {
  loadNotifications();
  setupListeners().catch((e) => console.error("监听通知事件失败", e));
});

onUnmounted(() => {
  unlisteners.forEach((fn) => fn());
  unlisteners = [];
});
</script>

<template>
  <div class="notify-page">
    <div class="notify-hero" />
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <div class="header-main">
        <h1 class="title">{{ pageTitle }}</h1>
        <p class="subtitle">好友、群组与动态的消息提醒</p>
      </div>
      <span v-if="totalUnread > 0" class="unread-chip">
        {{ totalUnread }} 未读
      </span>
    </div>

    <Tabs
      v-if="!pageType"
      v-model:active="activeTab"
      color="var(--color-primary)"
      title-active-color="var(--text-primary)"
      title-inactive-color="var(--text-tertiary)"
      :line-width="20"
      :line-height="2"
      class="notify-tabs"
    >
      <Tab v-for="cat in visibleCategories" :key="cat.key">
        <template #title>
          <Badge :content="unreadOf(cat)" :show-zero="false" :offset="[8, -2]">
            <span>{{ cat.label }}</span>
          </Badge>
        </template>

        <div class="clear-bar">
          <span class="clear-count">{{
            unreadOf(cat) > 0 ? `${unreadOf(cat)} 条未读` : ""
          }}</span>
          <Button size="small" type="primary" plain @click="clearUnread(cat)">
            清空未读
          </Button>
        </div>

        <div v-if="getFiltered(cat).length === 0" class="empty-wrap">
          <Empty description="暂无通知" />
        </div>

        <div v-else class="notify-list">
          <div
            v-for="n in getFiltered(cat)"
            :key="n.id"
            class="notify-item"
            :class="{ unread: n.is_read === false }"
            @click="markRead(n)"
          >
            <div
              class="notify-icon"
              :style="{
                background: iconBg(typeMeta(n).color),
                boxShadow: iconShadow(typeMeta(n).color),
              }"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
                />
              </svg>
            </div>
            <div class="notify-body">
              <div class="notify-head">
                <span class="type-tag">{{ typeMeta(n).label }}</span>
                <span class="notify-time">{{ formatTime(n.created_at) }}</span>
                <span v-if="n.is_read === false" class="unread-dot" />
              </div>
              <div v-if="n.title" class="notify-title">{{ n.title }}</div>
              <div v-if="n.content" class="notify-content">{{ n.content }}</div>
            </div>
          </div>
        </div>
      </Tab>
    </Tabs>

    <!-- 单类型模式: 只展示该页面的通知, 清除按钮只清对应 level -->
    <div v-else class="single-type">
      <div class="clear-bar">
        <span class="clear-count">{{
          unreadOf(singleCategory) > 0
            ? `${unreadOf(singleCategory)} 条未读`
            : ""
        }}</span>
        <Button
          size="small"
          type="primary"
          plain
          @click="clearUnread(singleCategory)"
        >
          清空未读
        </Button>
      </div>

      <div v-if="getFiltered(singleCategory).length === 0" class="empty-wrap">
        <Empty description="暂无通知" />
      </div>

      <div v-else class="notify-list">
        <div
          v-for="n in getFiltered(singleCategory)"
          :key="n.id"
          class="notify-item"
          :class="{ unread: n.is_read === false }"
          @click="markRead(n)"
        >
          <div
            class="notify-icon"
            :style="{
              background: iconBg(typeMeta(n).color),
              boxShadow: iconShadow(typeMeta(n).color),
            }"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
              />
            </svg>
          </div>
          <div class="notify-body">
            <div class="notify-head">
              <span class="type-tag">{{ typeMeta(n).label }}</span>
              <span class="notify-time">{{ formatTime(n.created_at) }}</span>
              <span v-if="n.is_read === false" class="unread-dot" />
            </div>
            <div v-if="n.title" class="notify-title">{{ n.title }}</div>
            <div v-if="n.content" class="notify-content">{{ n.content }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.notify-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 24px;
}

/* 顶部柔光渐变装饰 */
.notify-hero {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 220px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-primary) 14%, transparent) 0%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 0;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(14px, env(safe-area-inset-top)) 16px 12px;
  background: var(--header-bg);
  background: color-mix(in srgb, var(--header-bg) 82%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-light);

  .back-btn {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-full);
    background: var(--surface-alt);
    color: var(--text-primary);
    cursor: pointer;
    transition: background-color var(--transition-fast),
      transform var(--transition-fast);

    &:active {
      background: var(--surface-active);
      transform: scale(0.92);
    }

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: var(--text-primary);
    margin: 0;
  }

  .subtitle {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 2px 0 0;
  }

  .unread-chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: var(--gradient-primary);
    box-shadow: var(--shadow-glow-sm);
  }
}

.notify-tabs {
  position: relative;
  z-index: 9;

  :deep(.van-tabs__wrap) {
    background: var(--header-bg);
    background: color-mix(in srgb, var(--header-bg) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border-light);
  }

  :deep(.van-tabs__line) {
    height: 3px;
    border-radius: var(--radius-full);
    background: var(--gradient-primary);
  }

  :deep(.van-tab) {
    font-size: 14px;
  }
}

.clear-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;

  .clear-count {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
  }

  :deep(.van-button) {
    height: 26px;
    padding: 0 12px;
    font-size: 12px;
    border-radius: var(--radius-full);
  }
}

.notify-list {
  padding: 0 12px 4px;
}

.notify-item {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 14px;
  margin-bottom: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: transform var(--transition-fast),
    box-shadow var(--transition-fast), background-color var(--transition-fast);

  &:active {
    transform: scale(0.985);
    background: var(--surface-hover);
  }

  &.unread {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 14px;
      bottom: 14px;
      width: 3px;
      border-radius: var(--radius-full);
      background: var(--gradient-primary);
    }
  }
}

.notify-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: #fff;

  svg {
    width: 20px;
    height: 20px;
  }
}

.notify-body {
  flex: 1;
  min-width: 0;
}

.notify-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  background: var(--surface-alt);
  color: var(--text-secondary);
}

.notify-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.unread-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--gradient-primary);
  box-shadow: var(--shadow-glow-sm);
}

.notify-title {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-word;
}

.notify-content {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}

.empty-wrap {
  padding: 48px 0;
}
</style>
