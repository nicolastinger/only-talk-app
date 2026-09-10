<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAvatar } from "@/hooks/useAvatar";
import { useUserStore, DEFAULT_AVATAR } from "@/stores/user";
import { useUnreadStore } from "@/stores/unread";
import { getMyAccount } from "@/utils/api";

const router = useRouter();
const { userInfo, loadUserInfo } = useUserStore();
const { getAvatarUrl } = useAvatar();
const { notifyUnread } = useUnreadStore();

const account = ref("");
const avatarUrl = ref<string | null>(null);

const loadAvatar = async (icon: string) => {
  avatarUrl.value = await getAvatarUrl(icon);
};

onMounted(async () => {
  try {
    const acc = await getMyAccount();
    account.value = acc;
  } catch {
    /* ignore */
  }
  await loadUserInfo();
  if (userInfo.value?.icon) {
    loadAvatar(userInfo.value.icon);
  }
});

const getAvatar = () => avatarUrl.value || DEFAULT_AVATAR;

const goToEditProfile = () => {
  router.push("/profile/edit");
};

const goToNotifications = () => {
  router.push("/notifications");
};

const onMenuClick = () => {
  router.push("/settings");
};
</script>

<template>
  <div class="profile-page">
    <div class="header">
      <svg class="title-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
    </div>

    <div class="user-card">
      <div class="user-bg"></div>
      <div class="user-content" @click="goToEditProfile">
        <div class="avatar-wrapper">
          <img
            :src="getAvatar()"
            alt="avatar"
            class="user-avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
        </div>
        <div class="user-info">
          <h2 class="user-name">
            {{ userInfo?.username || account || "用户" }}
          </h2>
          <p class="user-account">账号: {{ userInfo?.account || account }}</p>
          <p v-if="userInfo?.info" class="user-bio">{{ userInfo.info }}</p>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="menu-section">
      <div class="menu-item" @click="goToNotifications">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
          <span class="menu-name">通知中心</span>
        </div>
        <div class="menu-right">
          <span v-if="notifyUnread > 0" class="menu-badge">{{
            notifyUnread > 99 ? "99+" : notifyUnread
          }}</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
            />
          </svg>
        </div>
      </div>
    </div>

    <div class="menu-section">
      <div class="menu-item">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            />
          </svg>
          <span class="menu-name">收藏</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="menu-section">
      <div class="menu-item">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"
            />
          </svg>
          <span class="menu-name">文件管理</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="menu-section">
      <div class="menu-item" @click="onMenuClick">
        <div class="menu-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="menu-icon">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
          <span class="menu-name">设置</span>
        </div>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.profile-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 80px;
}

.header {
  padding: max(16px, env(safe-area-inset-top)) 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.title-icon {
  width: 26px;
  height: 26px;
  color: var(--brand-blue);
  display: block;
}

.user-card {
  margin: 16px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-md);
}

.user-bg {
  position: absolute;
  inset: 0;
  background: var(--profile-hero-grad);
}

.user-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 20px;
  cursor: pointer;
  &:active {
    background: rgba(74, 144, 255, 0.04);
  }
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--profile-avatar-ring);
  box-shadow: var(--shadow-sm);
}

.user-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid var(--surface);
  box-shadow: var(--shadow-xs);
  object-fit: cover;
  display: block;
}

.user-info {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.user-account {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}
.user-bio {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow {
  width: 20px;
  height: 20px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.menu-section {
  margin: 0 16px 12px;
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
}
.menu-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.menu-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
  background: #ef4444;
  border-radius: 999px;
}
.menu-icon {
  width: 22px;
  height: 22px;
  color: var(--brand-blue);
  flex-shrink: 0;
}
.menu-name {
  font-size: 15px;
  color: var(--text-primary);
}
</style>
