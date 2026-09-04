<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  showToast,
  showConfirmDialog,
  PullRefresh,
  SwipeCell,
  Empty,
} from "vant";
import {
  get_accept_friend_request_list,
  get_pending_invitations,
  get_group_list,
  delete_friend,
} from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { parseResponse } from "@/utils/api";
import { DEFAULT_AVATAR } from "@/stores/user";
import type {
  FriendVo,
  GroupVo,
  FriendRequestInfo,
  FriendRequestInfoDTO,
} from "@workspace/types";

const router = useRouter();
const { getAvatarUrl } = useAvatar();

const friends = ref<FriendVo[]>([]);
const groups = ref<GroupVo[]>([]);
const refreshing = ref(false);
const sectionTab = ref(0);
const pendingRequestCount = ref(0);
const pendingGroupCount = ref(0);

const avatarMap = ref<Record<string, string | null>>({});
const groupAvatarMap = ref<Record<string, string | null>>({});

const resolveFriendAvatars = async () => {
  for (const f of friends.value) {
    const icon = f.friend_icon;
    if (!icon || avatarMap.value[icon] !== undefined) continue;
    const url = await getAvatarUrl(icon);
    avatarMap.value[icon] = url;
  }
};
watch(
  friends,
  () => {
    resolveFriendAvatars();
  },
  { immediate: true }
);

const resolveGroupAvatars = async () => {
  for (const g of groups.value) {
    const icon = g.avatar;
    if (!icon || groupAvatarMap.value[icon] !== undefined) continue;
    const url = await getAvatarUrl(icon);
    groupAvatarMap.value[icon] = url;
  }
};
watch(
  groups,
  () => {
    resolveGroupAvatars();
  },
  { immediate: true }
);

const loadFriendList = async () => {
  try {
    friends.value = (await invoke("get_friend_list")) || [];
  } catch (e) {
    console.error(e);
  }
};

const loadGroups = async () => {
  try {
    groups.value = (await get_group_list()) || [];
  } catch (e) {
    console.error(e);
  }
};
const loadPendingRequestCount = async () => {
  try {
    const dto: FriendRequestInfoDTO = {};
    const res = await get_accept_friend_request_list(dto);
    const list = res?.netSuccess ? parseResponse<FriendRequestInfo[]>(res) : [];
    pendingRequestCount.value = list.filter(
      (r) => r.accept_status === 0
    ).length;
  } catch (e) {
    console.error(e);
  }
};

const loadPendingGroupCount = async () => {
  try {
    const list = await get_pending_invitations();
    pendingGroupCount.value = (list || []).filter((i) => i.status === 1).length;
  } catch (e) {
    console.error(e);
  }
};

const onRefresh = async () => {
  refreshing.value = true;
  await Promise.all([
    loadFriendList(),
    loadGroups(),
    loadPendingRequestCount(),
    loadPendingGroupCount(),
  ]);
  refreshing.value = false;
};
const handleDelete = async (friend: FriendVo) => {
  try {
    await showConfirmDialog({
      title: "删除好友",
      message: `确定删除「${friend.friend_name}」吗？`,
      confirmButtonText: "删除",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
    await delete_friend(friend.friend_id);
    showToast({ message: "已删除", icon: "success" });
    await loadFriendList();
  } catch (e) {
    if (e !== "cancel") showToast({ message: "操作失败", icon: "fail" });
  }
};

const goSearch = () => router.push("/friends/search");
const goRequests = () => router.push("/friends/requests");
const goGroupRequests = () => router.push("/friends/group-requests");
const goDetail = (friend: FriendVo) =>
  router.push(`/friends/detail/${friend.friend_id}`);
const goChat = async (friend: FriendVo) => {
  try {
    await invoke("create_chat_session", { friendUuid: friend.friend_id });
  } catch {
    /* 会话可能已存在 */
  }
  router.push(`/chats/chat/${friend.friend_id}`);
};
const goGroupChat = async (group: GroupVo) => {
  try {
    await invoke("create_group_chat_session_command", {
      groupId: group.group_uuid,
    });
  } catch {
    /* 会话可能已存在 */
  }
  router.push(`/chats/group-chat/${group.group_uuid}`);
};

const getAvatar = (friend: FriendVo) => {
  const icon = friend.friend_icon;
  if (icon && avatarMap.value[icon] != null) {
    return avatarMap.value[icon];
  }
  return DEFAULT_AVATAR;
};

const getGroupAvatar = (group: GroupVo) => {
  const icon = group.avatar;
  if (icon && groupAvatarMap.value[icon] != null) {
    return groupAvatarMap.value[icon];
  }
  return null;
};

const hasGroupAvatar = (group: GroupVo) => !!getGroupAvatar(group);

let unlistenFriends: UnlistenFn | undefined;

onMounted(async () => {
  loadFriendList();
  loadGroups();
  loadPendingRequestCount();
  loadPendingGroupCount();
  try {
    unlistenFriends = await listen("friend_list_changed", () => {
      loadFriendList();
      loadGroups();
      loadPendingRequestCount();
      loadPendingGroupCount();
    });
  } catch (e) {
    console.error("监听好友列表变更失败", e);
  }
});

onUnmounted(() => {
  if (unlistenFriends) unlistenFriends();
});
</script>

<template>
  <div class="friends-page">
    <div class="header"><h1 class="title">好友</h1></div>

    <div class="search-section" @click="goSearch">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <span class="search-placeholder">搜索好友</span>
      </div>
    </div>

    <div class="entries">
      <div class="entry-card" @click="goRequests">
        <div class="entry-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </div>
        <div class="entry-info">
          <span class="entry-title">好友请求</span>
          <span class="entry-desc">查看新的好友申请</span>
        </div>
        <span v-if="pendingRequestCount > 0" class="entry-badge">{{
          pendingRequestCount > 99 ? "99+" : pendingRequestCount
        }}</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>

      <div class="entry-card" @click="goGroupRequests">
        <div class="entry-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
          </svg>
        </div>
        <div class="entry-info">
          <span class="entry-title">群组通知</span>
          <span class="entry-desc">查看群组邀请</span>
        </div>
        <span v-if="pendingGroupCount > 0" class="entry-badge">{{
          pendingGroupCount > 99 ? "99+" : pendingGroupCount
        }}</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div class="seg-tabs">
      <button
        class="seg-tab"
        :class="{ active: sectionTab === 0 }"
        @click="sectionTab = 0"
      >
        好友
      </button>
      <button
        class="seg-tab"
        :class="{ active: sectionTab === 1 }"
        @click="sectionTab = 1"
      >
        群组
      </button>
    </div>

    <div v-show="sectionTab === 0" class="tab-panel">
      <PullRefresh
        v-model="refreshing"
        :head-height="80"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="加载中..."
        @refresh="onRefresh"
      >
        <div v-if="friends.length > 0" class="friend-list">
          <SwipeCell v-for="friend in friends" :key="friend.friend_id">
            <div class="friend-item" @click="goDetail(friend)">
              <div class="friend-avatar-wrap">
                <img
                  :src="getAvatar(friend) || DEFAULT_AVATAR"
                  class="friend-avatar"
                  @error="
                    ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                  "
                />
              </div>
              <div class="friend-info">
                <span class="friend-name">{{ friend.friend_name }}</span>
                <span class="friend-account">@{{ friend.friend_account }}</span>
              </div>
              <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
                />
              </svg>
            </div>
            <template #right>
              <div class="swipe-chat" @click="goChat(friend)">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
                  />
                </svg>
                <span>发消息</span>
              </div>
              <div class="swipe-delete" @click="handleDelete(friend)">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
                <span>删除</span>
              </div>
            </template>
          </SwipeCell>
        </div>
        <Empty v-else description="暂无好友" />
      </PullRefresh>
    </div>

    <div v-show="sectionTab === 1" class="tab-panel">
      <PullRefresh
        v-model="refreshing"
        :head-height="80"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="加载中..."
        @refresh="onRefresh"
      >
        <div v-if="groups.length > 0" class="friend-list">
          <div
            v-for="group in groups"
            :key="group.group_uuid"
            class="friend-item"
            @click="goGroupChat(group)"
          >
            <template v-if="hasGroupAvatar(group)">
              <div class="friend-avatar-wrap">
                <img
                  :src="getGroupAvatar(group)!"
                  class="friend-avatar"
                  @error="
                    ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                  "
                />
              </div>
            </template>
            <div v-else class="group-avatar-fallback">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                />
              </svg>
            </div>
            <div class="friend-info">
              <span class="friend-name">{{ group.group_name }}</span>
              <span class="friend-account"
                >{{ group.member_count }} 位成员</span
              >
            </div>
            <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
              />
            </svg>
          </div>
        </div>
        <Empty v-else description="暂无群聊" />
      </PullRefresh>
    </div>

    <div class="fab" @click="goSearch">
      <svg viewBox="0 0 24 24" fill="white">
        <path
          d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="less">
.friends-page {
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

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.search-section {
  padding: 12px 20px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);
  &:active {
    background: var(--surface-hover);
  }
}

.search-icon {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.search-placeholder {
  font-size: 14px;
  color: var(--text-placeholder);
}

.seg-tabs {
  margin: 6px 12px 10px;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.seg-tab {
  flex: 1;
  height: 34px;
  border: none;
  border-radius: calc(var(--radius-lg) - 5px);
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

.tab-panel {
  min-height: 55vh;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 10px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.98);
  }
}

.entry-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
  svg {
    width: 22px;
    height: 22px;
  }
}

.entry-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.entry-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--badge-text);
  background: var(--badge-bg);
  border-radius: var(--radius-full);
}

.friend-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 12px 12px;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.98);
  }
}

.friend-avatar-wrap {
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
}

.friend-avatar {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--card-bg);
}

.group-avatar-fallback {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
  svg {
    width: 24px;
    height: 24px;
  }
}

.friend-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.friend-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.friend-account {
  font-size: 12px;
  color: var(--text-tertiary);
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

.swipe-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  height: 100%;
  background: var(--brand-blue);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  svg {
    width: 20px;
    height: 20px;
  }
}

.swipe-delete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  height: 100%;
  background: #ef4444;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  svg {
    width: 20px;
    height: 20px;
  }
}

.fab {
  position: fixed;
  bottom: 84px;
  right: 20px;
  width: 52px;
  height: 52px;
  background: var(--fab-bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--fab-shadow);
  cursor: pointer;
  z-index: 100;
  transition: all var(--transition-normal);
  svg {
    width: 26px;
    height: 26px;
  }
  &:active {
    transform: scale(0.95);
  }
}

:deep(.van-empty) {
  padding: 60px 0;
}
:deep(.van-empty__description) {
  color: var(--text-tertiary);
}
</style>
