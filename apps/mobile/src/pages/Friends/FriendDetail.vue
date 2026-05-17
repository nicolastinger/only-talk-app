<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast, showConfirmDialog, Empty } from "vant";
import { invoke } from "@tauri-apps/api/core";
import {
  get_friend_info,
  get_cached_user_info,
  delete_friend,
} from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { DEFAULT_AVATAR } from "@/stores/user";
import type { FriendVo, UserInfo } from "@workspace/types";

const route = useRoute();
const router = useRouter();
const friendId = route.params.friendId as string;
const { getAvatarUrl } = useAvatar();

interface FriendDetail {
  friendVo: FriendVo | null;
  userInfo: UserInfo | null;
}
const detail = ref<FriendDetail>({ friendVo: null, userInfo: null });
const loading = ref(true);
const loadError = ref(false);
const avatarUrl = ref<string | null>(null);

const loadDetail = async () => {
  loading.value = true;
  loadError.value = false;
  try {
    let userInfo: UserInfo | null = null;
    try {
      userInfo = await get_cached_user_info(friendId);
    } catch {}
    let friendVo: FriendVo | null = null;
    try {
      friendVo = (await get_friend_info(friendId)) as FriendVo | null;
    } catch {}
    detail.value = { friendVo, userInfo };

    const icon = friendVo?.friend_icon || userInfo?.icon;
    if (icon) {
      avatarUrl.value = await getAvatarUrl(icon);
    }
  } catch (e) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
};

const getAvatar = () => avatarUrl.value || DEFAULT_AVATAR;
const getDisplayName = () =>
  detail.value.friendVo?.friend_name ||
  detail.value.userInfo?.username ||
  detail.value.userInfo?.account ||
  friendId;
const getAccount = () =>
  detail.value.friendVo?.friend_account || detail.value.userInfo?.account || "";
const getBio = () => detail.value.userInfo?.info || "";
const getGenderText = (g?: number) =>
  ({ 0: "未知", 1: "保密", 2: "男", 3: "女", 4: "机器人", 5: "其他" }[g ?? 0] ||
  "");

const onDeleteFriend = async () => {
  try {
    await showConfirmDialog({
      title: "删除好友",
      message: `确定删除「${getDisplayName()}」吗？`,
      confirmButtonText: "删除",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
    await delete_friend(friendId);
    showToast({ message: "已删除", icon: "success" });
    router.back();
  } catch (e) {
    if (e !== "cancel") showToast({ message: "操作失败", icon: "fail" });
  }
};

const onSendMessage = async () => {
  try {
    await invoke("create_chat_session", { friendUuid: friendId });
  } catch {
    /* 会话可能已存在，忽略错误 */
  }
  router.push(`/chats/chat/${friendId}`);
};
const goBack = () => router.back();
onMounted(loadDetail);
</script>

<template>
  <div class="friend-detail-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">好友详情</h1>
    </div>

    <div v-if="loading" class="loading-state"><p>加载中...</p></div>
    <div v-else-if="loadError" class="error-state">
      <Empty description="加载失败，请返回重试" />
    </div>

    <template v-else>
      <div class="profile-card">
        <div class="profile-bg"></div>
        <div class="profile-content">
          <img
            :src="getAvatar()"
            class="profile-avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <h2 class="profile-name">{{ getDisplayName() }}</h2>
          <p class="profile-account">@{{ getAccount() }}</p>
          <p v-if="getBio()" class="profile-bio">{{ getBio() }}</p>
        </div>
      </div>

      <div class="info-section" v-if="detail.userInfo">
        <div class="info-item" v-if="getGenderText(detail.userInfo.gender)">
          <span class="info-label">性别</span
          ><span class="info-value">{{
            getGenderText(detail.userInfo.gender)
          }}</span>
        </div>
        <div class="info-item" v-if="detail.userInfo.age">
          <span class="info-label">年龄</span
          ><span class="info-value">{{ detail.userInfo.age }}</span>
        </div>
        <div class="info-item" v-if="detail.userInfo.email">
          <span class="info-label">邮箱</span
          ><span class="info-value">{{ detail.userInfo.email }}</span>
        </div>
        <div class="info-item" v-if="detail.userInfo.phone">
          <span class="info-label">手机</span
          ><span class="info-value">{{ detail.userInfo.phone }}</span>
        </div>
        <div class="info-item" v-if="detail.userInfo.address">
          <span class="info-label">地址</span
          ><span class="info-value">{{ detail.userInfo.address }}</span>
        </div>
      </div>

      <div class="actions-section">
        <button class="action-btn primary" @click="onSendMessage">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
            />
          </svg>
          <span>发消息</span>
        </button>
        <button class="action-btn danger" @click="onDeleteFriend">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
          <span>删除好友</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="less">
.friend-detail-page {
  min-height: 100vh;
  background: var(--page-bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  svg {
    width: 20px;
    height: 20px;
  }
  &:active {
    background: var(--surface-hover);
  }
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.loading-state {
  display: flex;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-tertiary);
}
.error-state {
  padding: 40px 0;
}

.profile-card {
  margin: 16px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border-medium);
  box-shadow: var(--shadow-md);
}

.profile-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--blue-100), var(--blue-50));
}

.profile-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 24px;
}

.profile-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
  object-fit: cover;
  margin-bottom: 16px;
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.profile-account {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0 0 8px;
}
.profile-bio {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
  line-height: 1.6;
  max-width: 280px;
}

.info-section {
  margin: 0 16px 16px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  font-size: 14px;
  color: var(--text-tertiary);
}
.info-value {
  font-size: 14px;
  color: var(--text-primary);
}

.actions-section {
  margin: 16px;
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
  svg {
    width: 20px;
    height: 20px;
  }
  &:active {
    transform: scale(0.97);
  }

  &.primary {
    background: var(--gradient-primary);
    color: #fff;
    box-shadow: var(--shadow-md);
  }
  &.danger {
    background: var(--surface);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #ef4444;
    box-shadow: var(--shadow-xs);
  }
}

:deep(.van-empty) {
  padding: 60px 0;
}
:deep(.van-empty__description) {
  color: var(--text-tertiary);
}
</style>
