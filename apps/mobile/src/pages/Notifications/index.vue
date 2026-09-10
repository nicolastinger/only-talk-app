<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { showToast, Tabs, Tab, Badge, Empty, Button } from "vant";
import { clearUnreadByLevel } from "@workspace/services";
import { useUnreadStore } from "@/stores/unread";
import type { SystemNotification } from "@workspace/types";

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
  { key: "plaza", label: "交友广场", level1: 1, level2: 4, clearLevel2: 4 },
  { key: "moments", label: "动态", level1: 1, level2: 5, clearLevel2: 5 },
];

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
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">通知中心</h1>
    </div>

    <Tabs
      v-model:active="activeTab"
      color="var(--color-primary)"
      title-active-color="var(--text-primary)"
      title-inactive-color="var(--text-tertiary)"
      :line-width="20"
      :line-height="2"
      class="notify-tabs"
    >
      <Tab v-for="cat in categories" :key="cat.key">
        <template #title>
          <Badge
            :content="unreadOf(cat)"
            :show-zero="false"
            :offset="[8, -2]"
          >
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
            <div class="notify-head">
              <span
                class="type-tag"
                :style="{ backgroundColor: typeMeta(n).color }"
                >{{ typeMeta(n).label }}</span
              >
              <span class="notify-time">{{ formatTime(n.created_at) }}</span>
              <span v-if="n.is_read === false" class="unread-dot" />
            </div>
            <div v-if="n.title" class="notify-title">{{ n.title }}</div>
            <div v-if="n.content" class="notify-content">{{ n.content }}</div>
          </div>
        </div>
      </Tab>
    </Tabs>
  </div>
</template>

<style scoped lang="less">
.notify-page {
  min-height: 100vh;
  background: var(--bg-page, #f5f6fa);
  padding-bottom: 24px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--header-bg, #fff);
  position: sticky;
  top: 0;
  z-index: 10;

  .back-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;

    svg {
      width: 22px;
      height: 22px;
    }
  }

  .title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}

.notify-tabs {
  :deep(.van-tabs__wrap) {
    background: var(--header-bg, #fff);
  }
}

.clear-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;

  .clear-count {
    font-size: 13px;
    color: var(--text-tertiary);
  }
}

.notify-list {
  padding: 0 12px;
}

.notify-item {
  position: relative;
  background: var(--header-bg, #fff);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;

  &.unread {
    box-shadow: inset 3px 0 0 var(--color-primary, #4a90ff);
  }
}

.notify-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  color: #fff;
}

.notify-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.notify-title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.notify-content {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #666);
  word-break: break-word;
}

.empty-wrap {
  padding: 48px 0;
}
</style>
