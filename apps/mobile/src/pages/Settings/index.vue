<script setup lang="ts">
import { useRouter } from "vue-router";
import { showDialog, showToast } from "vant";
import { useAuthStore } from "@/stores/auth";

interface SettingsEntry {
  key: string;
  name: string;
  desc?: string;
  icon: string;
  path: string;
}

const router = useRouter();
const { clearAuth } = useAuthStore();

const groups: { title: string; items: SettingsEntry[] }[] = [
  {
    title: "偏好设置",
    items: [
      {
        key: "general",
        name: "通用设置",
        desc: "主题等",
        icon: "general",
        path: "/settings/general",
      },
    ],
  },
  {
    title: "通知",
    items: [
      {
        key: "notification",
        name: "通知",
        desc: "管理所有通知功能",
        icon: "notification",
        path: "/settings/notification",
      },
    ],
  },
  {
    title: "账号与广场",
    items: [
      {
        key: "account",
        name: "账号与隐私",
        desc: "我的资料",
        icon: "account",
        path: "/settings/account",
      },
      {
        key: "blacklist",
        name: "黑名单",
        desc: "管理已拉黑的人",
        icon: "blacklist",
        path: "/settings/blacklist",
      },
      {
        key: "plaza",
        name: "广场设置",
        desc: "交友宣言与标签",
        icon: "plaza",
        path: "/settings/plaza",
      },
    ],
  },
  {
    title: "其他",
    items: [
      {
        key: "about",
        name: "关于 Only Talk",
        desc: "版本信息",
        icon: "about",
        path: "/settings/about",
      },
    ],
  },
];

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.replace("/profile");
  }
};

const goEntry = (entry: SettingsEntry) => {
  router.push(entry.path);
};

const onLogout = () => {
  showDialog({
    title: "退出登录",
    message: "确定要退出登录吗？",
    confirmButtonText: "退出",
    confirmButtonColor: "#ef4444",
    cancelButtonText: "取消",
  })
    .then(() => {
      clearAuth();
      showToast({ message: "已退出登录", icon: "success" });
      router.replace("/login");
    })
    .catch(() => {});
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="设置" left-arrow @click-left="goBack" />

    <div v-for="group in groups" :key="group.title" class="settings-section">
      <div class="section-title">{{ group.title }}</div>
      <div class="menu-card">
        <div
          v-for="item in group.items"
          :key="item.key"
          class="menu-item"
          @click="goEntry(item)"
        >
          <div class="menu-left">
            <svg
              v-if="item.icon === 'general'"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'notification'"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'account'"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'blacklist'"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'plaza'"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M12 10a2 2 0 100 4 2 2 0 000-4zm-6.94 2A6.97 6.97 0 0010 18.93V20h4v-1.07A6.97 6.97 0 0018.94 12H17c-3.87 0-7-3.13-7-7V3.06A6.97 6.97 0 005.06 12H5.06zm2.2-5.28A4.94 4.94 0 0010 9.94V11H7.93a4.94 4.94 0 00-1.86 2.93A6.9 6.9 0 0111 5.06c-.01 1.24.3 2.41.8 3.36-.6.26-1.26.3-2.54.3zM19.93 14.07A4.98 4.98 0 0017 12h.06c.72 0 1.42.15 2.05.43A6.9 6.9 0 0113 18.94v-1.5a4.99 4.99 0 006.93-3.37zM6.07 17.5a4.9 4.9 0 00-1.07-2.13l1.5-1.5c.2.5.47.98.8 1.43.33-.45.6-.93.8-1.43l1.5 1.5c-.3.4-.55.85-.73 1.33a6.4 6.4 0 00-1.6-.2h-.1v1.5c-.3-.5-.6-.5-1.1-.5z"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="currentColor"
              class="menu-icon"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              />
            </svg>
            <div class="menu-text">
              <span class="menu-name">{{ item.name }}</span>
              <span v-if="item.desc" class="menu-desc">{{ item.desc }}</span>
            </div>
          </div>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
        </div>
      </div>
    </div>

    <div class="logout-section">
      <button class="logout-btn" @click="onLogout">退出登录</button>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.settings-section {
  margin: 16px 16px 0;
}

.section-title {
  margin: 0 4px 8px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.menu-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.menu-icon {
  width: 22px;
  height: 22px;
  color: var(--brand-blue);
  flex-shrink: 0;
}

.menu-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.menu-name {
  font-size: 15px;
  color: var(--text-primary);
}

.menu-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.arrow {
  width: 20px;
  height: 20px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.logout-section {
  padding: 24px 16px;
  text-align: center;
}

.logout-btn {
  width: 100%;
  max-width: 300px;
  height: 48px;
  background: var(--surface);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);
  &:active {
    background: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.4);
  }
}
</style>
