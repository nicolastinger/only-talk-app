<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, Tabs, Tab, Badge, Empty } from "vant";
import {
  accept_group_invitation,
  decline_group_invitation,
  get_pending_invitations,
  get_sent_invitations,
  get_user_info_with_cache,
} from "@workspace/services";
import type { GroupInvitationVo, UserInfo } from "@workspace/types";
import { useUnreadStore } from "@/stores/unread";

const router = useRouter();
const goBack = () => router.back();
const { refreshFriendCounts } = useUnreadStore();

const CLOCK_ICON =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";
const CHECK_ICON = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const CLOSE_ICON =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

interface InvitationWithUser extends GroupInvitationVo {
  user?: UserInfo | null;
  partyName?: string;
}

const userCache = new Map<string, UserInfo | null>();
const pendingUsers = new Map<string, Promise<UserInfo | null>>();

const resolveUserName = async (uuid: string): Promise<UserInfo | null> => {
  if (!uuid) return null;
  const cached = userCache.get(uuid);
  if (cached !== undefined) return cached;
  const inflight = pendingUsers.get(uuid);
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const result = await get_user_info_with_cache(uuid);
      const userInfo = result?.user_info ?? null;
      if (userInfo) userCache.set(uuid, userInfo);
      return userInfo;
    } catch (e) {
      console.error("解析群邀请用户信息失败", e);
      return null;
    } finally {
      pendingUsers.delete(uuid);
    }
  })();
  pendingUsers.set(uuid, promise);
  return promise;
};

const receivedList = ref<InvitationWithUser[]>([]);
const sentList = ref<InvitationWithUser[]>([]);

const pendingReceivedCount = computed(
  () => receivedList.value.filter((i) => i.status === 1).length
);
const pendingSentCount = computed(
  () => sentList.value.filter((i) => i.status === 1).length
);

const enrichList = async (
  list: GroupInvitationVo[],
  useInviter: boolean
): Promise<InvitationWithUser[]> => {
  return Promise.all(
    list.map(async (item) => {
      const uuid = useInviter ? item.inviter_uuid : item.invitee_uuid;
      const user = await resolveUserName(uuid);
      const partyName =
        user?.username || (uuid ? uuid.slice(0, 8) + "..." : "未知");
      return { ...item, user, partyName };
    })
  );
};

const loadInvitations = async () => {
  try {
    const [received, sent] = await Promise.all([
      get_pending_invitations().catch(() => [] as GroupInvitationVo[]),
      get_sent_invitations().catch(() => [] as GroupInvitationVo[]),
    ]);
    receivedList.value = await enrichList(received || [], true);
    sentList.value = await enrichList(sent || [], false);
  } catch (e) {
    console.error(e);
  }
};

const handleAccept = async (inv: GroupInvitationVo) => {
  try {
    const ok = await accept_group_invitation(inv.group_uuid);
    if (ok) {
      showToast({ message: "已接受邀请", icon: "success" });
    } else {
      showToast({ message: "接受失败", icon: "fail" });
    }
    await loadInvitations();
    await refreshFriendCounts();
  } catch (e) {
    console.error(e);
    showToast({ message: "接受失败", icon: "fail" });
  }
};

const handleDecline = async (inv: GroupInvitationVo) => {
  try {
    const ok = await decline_group_invitation(inv.group_uuid);
    if (ok) {
      showToast({ message: "已拒绝邀请", icon: "success" });
    } else {
      showToast({ message: "拒绝失败", icon: "fail" });
    }
    await loadInvitations();
    await refreshFriendCounts();
  } catch (e) {
    console.error(e);
    showToast({ message: "拒绝失败", icon: "fail" });
  }
};

const getStatusMeta = (status?: number) => {
  if (status === 1) return { text: "待处理", cls: "pending", icon: CLOCK_ICON };
  if (status === 2)
    return { text: "已接受", cls: "accepted", icon: CHECK_ICON };
  if (status === 3)
    return { text: "已拒绝", cls: "rejected", icon: CLOSE_ICON };
  return { text: "未知", cls: "unknown", icon: "" };
};

const formatTime = (ts?: number) => {
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

onMounted(() => {
  loadInvitations();
});
</script>

<template>
  <div class="group-invites-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">群组通知</h1>
    </div>

    <Tabs
      color="var(--color-primary)"
      title-active-color="var(--text-primary)"
      title-inactive-color="var(--text-tertiary)"
      :line-width="20"
      :line-height="2"
      class="invites-tabs"
    >
      <Tab>
        <template #title
          ><Badge
            :content="pendingReceivedCount"
            :show-zero="false"
            :offset="[8, -2]"
            ><span>邀请我的</span></Badge
          ></template
        >
        <div v-if="receivedList.length > 0" class="invite-list">
          <div v-for="inv in receivedList" :key="inv.id" class="invite-item">
            <div class="invite-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                />
              </svg>
            </div>
            <div class="invite-info">
              <div class="invite-head">
                <span class="invite-group">{{ inv.group_name }}</span>
                <span
                  class="invite-status"
                  :class="getStatusMeta(inv.status).cls"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      :d="getStatusMeta(inv.status).icon"
                      fill-rule="evenodd"
                    />
                  </svg>
                  <span>{{ getStatusMeta(inv.status).text }}</span>
                </span>
              </div>
              <span class="invite-desc"
                >{{ inv.partyName }} 邀请你加入群聊</span
              >
              <span class="invite-time">{{ formatTime(inv.created_at) }}</span>
            </div>
            <div v-if="inv.status === 1" class="invite-actions">
              <button class="accept-btn" @click="handleAccept(inv)">
                接受
              </button>
              <button class="reject-btn" @click="handleDecline(inv)">
                拒绝
              </button>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无收到的邀请" />
      </Tab>
      <Tab>
        <template #title
          ><Badge
            :content="pendingSentCount"
            :show-zero="false"
            :offset="[8, -2]"
            ><span>我邀请的</span></Badge
          ></template
        >
        <div v-if="sentList.length > 0" class="invite-list">
          <div v-for="inv in sentList" :key="inv.id" class="invite-item">
            <div class="invite-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                />
              </svg>
            </div>
            <div class="invite-info">
              <div class="invite-head">
                <span class="invite-group">{{ inv.group_name }}</span>
                <span
                  class="invite-status"
                  :class="getStatusMeta(inv.status).cls"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      :d="getStatusMeta(inv.status).icon"
                      fill-rule="evenodd"
                    />
                  </svg>
                  <span>{{ getStatusMeta(inv.status).text }}</span>
                </span>
              </div>
              <span class="invite-desc"
                >你邀请了 {{ inv.partyName }} 加入群聊</span
              >
              <span class="invite-time">{{ formatTime(inv.created_at) }}</span>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无发出的邀请" />
      </Tab>
    </Tabs>
  </div>
</template>

<style scoped lang="less">
.group-invites-page {
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

.invites-tabs {
  :deep(.van-tabs__nav) {
    background: transparent !important;
    padding: 0 12px;
  }
  :deep(.van-tabs__content) {
    min-height: 60vh;
  }
}

.invite-list {
  padding: 12px 0;
}

.invite-item {
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

.invite-icon {
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

.invite-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.invite-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.invite-group {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-desc {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-time {
  font-size: 11px;
  color: var(--text-placeholder);
}

.invite-status {
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

.invite-status.pending {
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border: 1px solid rgba(250, 173, 20, 0.3);
}

.invite-status.accepted {
  color: var(--color-success);
  background: var(--color-success-bg);
  border: 1px solid rgba(82, 196, 26, 0.3);
}

.invite-status.rejected {
  color: var(--color-error);
  background: var(--color-error-bg);
  border: 1px solid rgba(255, 77, 79, 0.3);
}

.invite-status.unknown {
  color: var(--text-tertiary);
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
}

.invite-actions {
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
