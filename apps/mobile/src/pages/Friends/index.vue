<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import {
  showToast,
  showConfirmDialog,
  PullRefresh,
  Tabs,
  Tab,
  Badge,
  SwipeCell,
  Empty,
} from "vant";
import {
  get_accept_friend_request_list,
  get_friend_request_list,
  process_friend_request,
  delete_friend,
} from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { parseResponse } from "@/utils/api";
import { DEFAULT_AVATAR } from "@/stores/user";
import type {
  FriendVo,
  FriendRequestInfo,
  FriendRequestInfoDTO,
} from "@workspace/types";

const router = useRouter();
const { getAvatarUrl } = useAvatar();

const friends = ref<FriendVo[]>([]);
const refreshing = ref(false);
const activeTab = ref(0);
const receivedRequests = ref<FriendRequestInfo[]>([]);
const sentRequests = ref<FriendRequestInfo[]>([]);

const avatarMap = ref<Record<string, string | null>>({});

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

const pendingReceivedCount = computed(
  () => receivedRequests.value.filter((r) => r.accept_status === 0).length
);
const pendingSentCount = computed(
  () => sentRequests.value.filter((r) => r.accept_status === 0).length
);

const loadFriendList = async () => {
  try {
    friends.value = (await invoke("get_friend_list")) || [];
  } catch (e) {
    console.error(e);
  }
};

const onRefresh = async () => {
  refreshing.value = true;
  await loadFriendList();
  refreshing.value = false;
};

const loadFriendRequests = async () => {
  try {
    const dto: FriendRequestInfoDTO = {};
    const [receivedRes, sentRes] = await Promise.all([
      get_accept_friend_request_list(dto).catch(() => null),
      get_friend_request_list(dto).catch(() => null),
    ]);
    receivedRequests.value = receivedRes?.netSuccess
      ? parseResponse<FriendRequestInfo[]>(receivedRes)
      : [];
    sentRequests.value = sentRes?.netSuccess
      ? parseResponse<FriendRequestInfo[]>(sentRes)
      : [];
  } catch (e) {
    console.error(e);
  }
};

const handleAccept = async (req: FriendRequestInfo) => {
  try {
    await process_friend_request({
      accept_message: "",
      request_user: req.request_user,
      add_type: "card",
      version: 0,
      accept_status: 1,
    });
    showToast({ message: "已接受", icon: "success" });
    await Promise.all([loadFriendList(), loadFriendRequests()]);
  } catch (e) {
    showToast({ message: "操作失败", icon: "fail" });
  }
};

const handleReject = async (req: FriendRequestInfo) => {
  try {
    await process_friend_request({
      accept_message: "",
      request_user: req.request_user,
      add_type: "card",
      version: 0,
      accept_status: 2,
    });
    showToast({ message: "已拒绝", icon: "success" });
    await loadFriendRequests();
  } catch (e) {
    showToast({ message: "操作失败", icon: "fail" });
  }
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

const getAvatar = (friend: FriendVo) => {
  const icon = friend.friend_icon;
  if (icon && avatarMap.value[icon] != null) {
    return avatarMap.value[icon];
  }
  return DEFAULT_AVATAR;
};

const getRequestAvatar = (req: any) => {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${
    req.request_user || req.accept_user || "user"
  }`;
};

const getRequestTime = (ts: number) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};
const isPending = (s?: number) => s === 0;
const isAccepted = (s?: number) => s === 1;
const isRejected = (s?: number) => s === 2;

onMounted(() => {
  loadFriendList();
  loadFriendRequests();
});
watch(activeTab, (v) => {
  if (v === 1) loadFriendRequests();
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

    <Tabs
      v-model:active="activeTab"
      :color="'#4a90ff'"
      :title-active-color="'#1a2a3a'"
      :title-inactive-color="'#7a8a9a'"
      :line-width="24"
      :line-height="2"
      sticky
      class="friends-tabs"
    >
      <Tab title="好友列表">
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
                <img
                  :src="getAvatar(friend) || DEFAULT_AVATAR"
                  class="avatar"
                  @error="
                    ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                  "
                />
                <div class="friend-info">
                  <span class="friend-name">{{ friend.friend_name }}</span>
                  <span class="friend-account"
                    >@{{ friend.friend_account }}</span
                  >
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
      </Tab>

      <Tab>
        <template #title
          ><Badge
            :content="pendingReceivedCount"
            :show-zero="false"
            :offset="[10, -2]"
            ><span>好友请求</span></Badge
          ></template
        >
        <Tabs
          :color="'#4a90ff'"
          :title-active-color="'#1a2a3a'"
          :title-inactive-color="'#7a8a9a'"
          :line-width="20"
          :line-height="2"
          class="request-subtabs"
        >
          <Tab>
            <template #title
              ><Badge
                :content="pendingReceivedCount"
                :show-zero="false"
                :offset="[8, -2]"
                ><span>收到的</span></Badge
              ></template
            >
            <div v-if="receivedRequests.length > 0" class="request-list">
              <div
                v-for="req in receivedRequests"
                :key="req.uuid"
                class="request-item"
              >
                <img
                  :src="getRequestAvatar(req)"
                  class="request-avatar"
                  @error="
                    ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                  "
                />
                <div class="request-info">
                  <span class="request-name">{{
                    req.request_user || "未知"
                  }}</span>
                  <span v-if="req.request_message" class="request-msg">{{
                    req.request_message
                  }}</span>
                  <span class="request-time">{{
                    getRequestTime(req.created_at)
                  }}</span>
                </div>
                <div
                  class="request-actions"
                  v-if="isPending(req.accept_status)"
                >
                  <button class="accept-btn" @click="handleAccept(req)">
                    接受
                  </button>
                  <button class="reject-btn" @click="handleReject(req)">
                    拒绝
                  </button>
                </div>
                <span
                  v-else
                  class="request-status"
                  :class="{
                    accepted: isAccepted(req.accept_status),
                    rejected: isRejected(req.accept_status),
                  }"
                  >{{
                    isAccepted(req.accept_status) ? "已接受" : "已拒绝"
                  }}</span
                >
              </div>
            </div>
            <Empty v-else description="暂无收到的请求" />
          </Tab>
          <Tab>
            <template #title
              ><Badge
                :content="pendingSentCount"
                :show-zero="false"
                :offset="[8, -2]"
                ><span>发出的</span></Badge
              ></template
            >
            <div v-if="sentRequests.length > 0" class="request-list">
              <div
                v-for="req in sentRequests"
                :key="req.uuid"
                class="request-item"
              >
                <img
                  :src="getRequestAvatar(req)"
                  class="request-avatar"
                  @error="
                    ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                  "
                />
                <div class="request-info">
                  <span class="request-name">{{
                    req.accept_user || "未知"
                  }}</span>
                  <span v-if="req.request_message" class="request-msg">{{
                    req.request_message
                  }}</span>
                  <span class="request-time">{{
                    getRequestTime(req.created_at)
                  }}</span>
                </div>
                <span
                  class="request-status"
                  :class="{
                    accepted: isAccepted(req.accept_status),
                    rejected: isRejected(req.accept_status),
                    pending: isPending(req.accept_status),
                  }"
                  >{{
                    isAccepted(req.accept_status)
                      ? "已接受"
                      : isRejected(req.accept_status)
                      ? "已拒绝"
                      : "待确认"
                  }}</span
                >
              </div>
            </div>
            <Empty v-else description="暂无发出的请求" />
          </Tab>
        </Tabs>
      </Tab>
    </Tabs>

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
  padding: 16px 20px;
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

.friends-tabs {
  :deep(.van-tabs__nav) {
    background: transparent !important;
    padding: 0 12px;
  }
  :deep(.van-tabs__content) {
    min-height: 50vh;
  }
}

.friend-list {
  padding: 4px 0;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  cursor: pointer;
  transition: background var(--transition-fast);
  &:active {
    background: var(--surface-hover);
  }
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-xs);
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
  font-weight: 500;
  color: var(--text-primary);
}
.friend-account {
  font-size: 13px;
  color: var(--text-tertiary);
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

.request-subtabs {
  :deep(.van-tabs__nav) {
    background: transparent !important;
    padding: 0 12px;
  }
}

.request-list {
  padding: 4px 0;
}

.request-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.request-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.request-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.request-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}
.request-msg {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--blue-50);
  padding: 4px 10px;
  border-radius: 8px;
  align-self: flex-start;
}
.request-time {
  font-size: 11px;
  color: var(--text-placeholder);
}

.request-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.accept-btn,
.reject-btn {
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
  &:active {
    transform: scale(0.96);
  }
}
.accept-btn {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.reject-btn {
  background: var(--surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
}

.request-status {
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.request-status.accepted {
  color: var(--color-success);
}
.request-status.rejected {
  color: var(--color-error);
}
.request-status.pending {
  color: var(--color-warning);
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
