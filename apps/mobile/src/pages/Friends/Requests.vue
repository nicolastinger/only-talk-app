<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { showToast, Tabs, Tab, Badge, Empty } from "vant";
import {
  get_accept_friend_request_list,
  get_friend_request_list,
  get_user_info_with_cache,
  process_friend_request,
  readContactsNotification,
} from "@workspace/services";
import { useAvatar } from "@/hooks/useAvatar";
import { parseResponse } from "@/utils/api";
import { useUnreadStore } from "@/stores/unread";
import { DEFAULT_AVATAR } from "@/stores/user";
import type {
  FriendRequestInfo,
  FriendRequestInfoDTO,
  UserInfo,
} from "@workspace/types";

const router = useRouter();
const { getAvatarUrl } = useAvatar();
const { refreshFriendCounts } = useUnreadStore();
const goBack = () => router.back();

const DEFAULT_REQUEST_MESSAGE = "请求添加你为好友";
const ACCEPT_MESSAGE = "我通过了你的好友申请";
const REJECT_MESSAGE = "我拒绝了你的好友申请";

const CLOCK_ICON =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";
const CHECK_ICON = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const CLOSE_ICON =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

interface RequestWithUserInfo extends FriendRequestInfo {
  userInfo?: UserInfo | null;
  avatarUrl?: string | null;
}

const userInfoCache = new Map<
  string,
  { userInfo: UserInfo | null; avatarUrl: string | null }
>();
const pendingUserInfo = new Map<
  string,
  Promise<{ userInfo: UserInfo | null; avatarUrl: string | null }>
>();

const receivedRequests = ref<RequestWithUserInfo[]>([]);
const sentRequests = ref<RequestWithUserInfo[]>([]);

const pendingReceivedCount = computed(
  () => receivedRequests.value.filter((r) => r.accept_status === 0).length
);
const pendingSentCount = computed(
  () => sentRequests.value.filter((r) => r.accept_status === 0).length
);

const markRequestsRead = async (ids: string[]) => {
  try {
    await readContactsNotification(ids);
  } catch (e) {
    console.error("标记好友请求已读失败", e);
  }
};

const resolveRequestUser = async (uuid: string) => {
  if (!uuid) return { userInfo: null, avatarUrl: null };
  const cached = userInfoCache.get(uuid);
  if (cached) return cached;
  const inflight = pendingUserInfo.get(uuid);
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const result = await get_user_info_with_cache(uuid);
      const userInfo = result?.user_info ?? null;
      const avatarUrl = userInfo?.icon
        ? await getAvatarUrl(userInfo.icon)
        : null;
      const value = { userInfo, avatarUrl };
      if (userInfo) userInfoCache.set(uuid, value);
      return value;
    } catch (e) {
      console.error("解析好友请求用户信息失败", e);
      return { userInfo: null, avatarUrl: null };
    } finally {
      pendingUserInfo.delete(uuid);
    }
  })();
  pendingUserInfo.set(uuid, promise);
  return promise;
};

const enrichRequests = async (
  list: FriendRequestInfo[],
  isReceived: boolean
): Promise<RequestWithUserInfo[]> => {
  return Promise.all(
    list.map(async (req) => {
      const target = isReceived ? req.request_user : req.accept_user;
      const { userInfo, avatarUrl } = await resolveRequestUser(target || "");
      return { ...req, userInfo, avatarUrl };
    })
  );
};

const loadFriendRequests = async () => {
  try {
    const dto: FriendRequestInfoDTO = {};
    const [receivedRes, sentRes] = await Promise.all([
      get_accept_friend_request_list(dto).catch(() => null),
      get_friend_request_list(dto).catch(() => null),
    ]);
    const receivedRaw = receivedRes?.netSuccess
      ? parseResponse<FriendRequestInfo[]>(receivedRes)
      : [];
    const sentRaw = sentRes?.netSuccess
      ? parseResponse<FriendRequestInfo[]>(sentRes)
      : [];
    receivedRequests.value = await enrichRequests(receivedRaw, true);
    sentRequests.value = await enrichRequests(sentRaw, false);

    const ids = [...receivedRaw, ...sentRaw]
      .map((item) => item.uuid)
      .filter((item): item is string => !!item);
    if (ids.length > 0) markRequestsRead(ids);
  } catch (e) {
    console.error(e);
  }
};

const handleAccept = async (req: FriendRequestInfo) => {
  try {
    await process_friend_request({
      accept_message: ACCEPT_MESSAGE,
      request_user: req.request_user,
      add_type: "card",
      version: 0,
      accept_status: 1,
    });
    showToast({ message: "已接受", icon: "success" });
    await invoke("update_local_friend_list", {}).catch(() => {});
    await loadFriendRequests();
    await refreshFriendCounts();
  } catch (e) {
    showToast({ message: "操作失败", icon: "fail" });
  }
};

const handleReject = async (req: FriendRequestInfo) => {
  try {
    await process_friend_request({
      accept_message: REJECT_MESSAGE,
      request_user: req.request_user,
      add_type: "card",
      version: 0,
      accept_status: 2,
    });
    showToast({ message: "已拒绝", icon: "success" });
    await loadFriendRequests();
    await refreshFriendCounts();
  } catch (e) {
    showToast({ message: "操作失败", icon: "fail" });
  }
};

const getRequestName = (req: RequestWithUserInfo) =>
  req.userInfo?.username || req.request_user || req.accept_user || "未知";

const getRequestAccount = (req: RequestWithUserInfo) =>
  req.userInfo?.account || "";

const getRequestBio = (req: RequestWithUserInfo) => req.userInfo?.info || "";

const getRequestAvatarSrc = (req: RequestWithUserInfo) =>
  req.avatarUrl || DEFAULT_AVATAR;

const getStatusMeta = (status?: number) => {
  if (status === 0)
    return { text: "等待验证", cls: "pending", icon: CLOCK_ICON };
  if (status === 1)
    return { text: "已接受", cls: "accepted", icon: CHECK_ICON };
  if (status === 2)
    return { text: "已拒绝", cls: "rejected", icon: CLOSE_ICON };
  return { text: "未知", cls: "unknown", icon: "" };
};

const isPending = (status?: number) => status === 0;

const formatRequestTime = (ts?: number) => {
  if (!ts) return "未知时间";
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes <= 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

let unlistenRequests: UnlistenFn | undefined;

onMounted(async () => {
  loadFriendRequests();
  try {
    unlistenRequests = await listen("friend_list_changed", () => {
      loadFriendRequests();
      refreshFriendCounts();
    });
  } catch (e) {
    console.error("监听好友列表变更失败", e);
  }
});

onUnmounted(() => {
  if (unlistenRequests) unlistenRequests();
});
</script>

<template>
  <div class="requests-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">好友请求</h1>
    </div>

    <Tabs
      color="var(--color-primary)"
      title-active-color="var(--text-primary)"
      title-inactive-color="var(--text-tertiary)"
      :line-width="20"
      :line-height="2"
      class="request-tabs"
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
            <div class="request-avatar-wrap">
              <img
                :src="getRequestAvatarSrc(req)"
                class="request-avatar"
                @error="
                  ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                "
              />
            </div>
            <div class="request-info">
              <div class="request-head">
                <div class="request-identity">
                  <span class="request-name">{{ getRequestName(req) }}</span>
                  <span v-if="getRequestAccount(req)" class="request-account"
                    >@{{ getRequestAccount(req) }}</span
                  >
                </div>
                <span
                  class="request-status"
                  :class="getStatusMeta(req.accept_status).cls"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      :d="getStatusMeta(req.accept_status).icon"
                      fill-rule="evenodd"
                    />
                  </svg>
                  <span>{{ getStatusMeta(req.accept_status).text }}</span>
                </span>
              </div>
              <span v-if="getRequestBio(req)" class="request-bio">{{
                getRequestBio(req)
              }}</span>
              <span class="request-msg">{{
                req.request_message || DEFAULT_REQUEST_MESSAGE
              }}</span>
              <span class="request-time">{{
                formatRequestTime(req.created_at)
              }}</span>
            </div>
            <div v-if="isPending(req.accept_status)" class="request-actions">
              <button class="accept-btn" @click="handleAccept(req)">
                接受
              </button>
              <button class="reject-btn" @click="handleReject(req)">
                拒绝
              </button>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无收到的好友请求" />
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
          <div v-for="req in sentRequests" :key="req.uuid" class="request-item">
            <div class="request-avatar-wrap">
              <img
                :src="getRequestAvatarSrc(req)"
                class="request-avatar"
                @error="
                  ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                "
              />
            </div>
            <div class="request-info">
              <div class="request-head">
                <div class="request-identity">
                  <span class="request-name">{{ getRequestName(req) }}</span>
                  <span v-if="getRequestAccount(req)" class="request-account"
                    >@{{ getRequestAccount(req) }}</span
                  >
                </div>
                <span
                  class="request-status"
                  :class="getStatusMeta(req.accept_status).cls"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      :d="getStatusMeta(req.accept_status).icon"
                      fill-rule="evenodd"
                    />
                  </svg>
                  <span>{{ getStatusMeta(req.accept_status).text }}</span>
                </span>
              </div>
              <span v-if="getRequestBio(req)" class="request-bio">{{
                getRequestBio(req)
              }}</span>
              <span class="request-msg">{{
                req.request_message || DEFAULT_REQUEST_MESSAGE
              }}</span>
              <span class="request-time">{{
                formatRequestTime(req.created_at)
              }}</span>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无发起的好友请求" />
      </Tab>
    </Tabs>
  </div>
</template>

<style scoped lang="less">
.requests-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) 20px;
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

.request-tabs {
  :deep(.van-tabs__nav) {
    background: transparent !important;
    padding: 0 12px;
  }
  :deep(.van-tabs__content) {
    min-height: 60vh;
  }
}

.request-list {
  padding: 12px 0;
}

.request-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  margin: 0 12px 12px;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.98);
  }

  &:last-child {
    margin-bottom: 4px;
  }
}

.request-avatar-wrap {
  flex-shrink: 0;
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
}

.request-avatar {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--card-bg);
}

.request-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.request-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.request-identity {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.request-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-account {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-bio {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-msg {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--surface-alt);
  padding: 6px 10px;
  border-radius: 8px;
  align-self: flex-start;
  max-width: 100%;
}

.request-time {
  font-size: 11px;
  color: var(--text-placeholder);
}

.request-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 4px 9px;
  border-radius: var(--radius-full);
  white-space: nowrap;

  svg {
    width: 11px;
    height: 11px;
  }
}

.request-status.pending {
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border: 1px solid rgba(250, 173, 20, 0.3);
}

.request-status.accepted {
  color: var(--color-success);
  background: var(--color-success-bg);
  border: 1px solid rgba(82, 196, 26, 0.3);
}

.request-status.rejected {
  color: var(--color-error);
  background: var(--color-error-bg);
  border: 1px solid rgba(255, 77, 79, 0.3);
}

.request-status.unknown {
  color: var(--text-tertiary);
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
}

.request-actions {
  flex-shrink: 0;
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.accept-btn,
.reject-btn {
  min-width: 60px;
  padding: 7px 16px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:active {
    transform: scale(0.96);
  }
}

.accept-btn {
  background: var(--gradient-primary);
  color: #fff;
  border: none;
  box-shadow: var(--shadow-sm);
}

.reject-btn {
  background: var(--surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
  &:active {
    border-color: var(--color-error);
    color: var(--color-error);
  }
}

:deep(.van-empty) {
  padding: 60px 0;
}
:deep(.van-empty__description) {
  color: var(--text-tertiary);
}
</style>
