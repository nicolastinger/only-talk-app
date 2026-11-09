<script setup lang="ts">
import { computed, markRaw, onUnmounted, ref, watch } from 'vue';
import {
  CheckOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import {
  clearUnreadByLevel,
  get_accept_friend_request_list,
  get_friend_request_list,
  get_user_info_with_cache,
  getFiles,
  getUnreadNotificationCounts,
  isHttpSuccess,
  process_friend_request,
  readContactsNotification,
  subscribe,
} from '@workspace/services';
import type {
  FriendRequestInfo,
  FriendRequestInfoDTO,
  UserInfo,
} from '@workspace/types';
import styles from './index.module.less';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

interface RequestWithUserInfo extends FriendRequestInfo {
  userInfo?: UserInfo | null;
  avatarUrl?: string;
}

const { t } = useI18n();
const store = useBearStore();

const acceptRequests = ref<RequestWithUserInfo[]>([]);
const sentRequests = ref<RequestWithUserInfo[]>([]);
const loading = ref(false);

const refreshUnreadCounts = async () => {
  try {
    const counts = await getUnreadNotificationCounts();
    const current = store.menuUnread;
    store.setMenuUnread({
      ...current,
      contacts: counts.contacts,
      groups: counts.groups,
      plaza: counts.plaza,
      moments: counts.moments,
      total: counts.contacts + counts.groups + counts.plaza + counts.moments,
    });
  } catch (e) {
    console.log('刷新未读通知数量失败', e);
  }
};

const enrichRequestWithUserInfo = async (
  request: FriendRequestInfo,
  isReceived: boolean,
): Promise<RequestWithUserInfo> => {
  const userUuid = isReceived ? request.request_user : request.accept_user;
  if (!userUuid) {
    return { ...request };
  }

  try {
    const result = await get_user_info_with_cache(userUuid);
    const userInfo = result.user_info;
    let avatarUrl = '';

    if (userInfo?.icon) {
      const fileVos = await getFiles(userInfo.icon);
      avatarUrl = fileVos?.[0]?.tauri_file_path || '';
    }

    console.log(
      `好友请求用户信息 ${userUuid}: from_cache=${result.from_cache}`,
    );

    return {
      ...request,
      userInfo,
      avatarUrl,
    };
  } catch (error) {
    console.log('获取用户信息失败', error);
    return { ...request };
  }
};

const getFriendRequestList = async () => {
  const friendRequestInfoDTO: FriendRequestInfoDTO = {};
  try {
    const res = await get_friend_request_list(friendRequestInfoDTO);
    if (res.netSuccess && isHttpSuccess(res.res.status)) {
      const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
      const enrichedData = await Promise.all(
        data.map((item) => enrichRequestWithUserInfo(item, false)),
      );
      sentRequests.value = enrichedData;
      const ids = data
        .map((item) => item.uuid)
        .filter((item) => item !== undefined) as string[];
      if (ids && ids.length > 0) {
        await readContactsNotification(ids);
      }
    }
  } catch (e) {
    console.log('获取我发起的好友请求失败', e);
  }
};

const getAcceptFriendRequestList = async () => {
  const friendRequestInfoDTO: FriendRequestInfoDTO = {};
  try {
    const res = await get_accept_friend_request_list(friendRequestInfoDTO);
    if (res.netSuccess && isHttpSuccess(res.res.status)) {
      const data = JSON.parse(res.res.body).data as FriendRequestInfo[];
      const enrichedData = await Promise.all(
        data.map((item) => enrichRequestWithUserInfo(item, true)),
      );
      acceptRequests.value = enrichedData;
      const ids = data
        .map((item) => item.uuid)
        .filter((item) => item !== undefined) as string[];
      if (ids && ids.length > 0) {
        await readContactsNotification(ids);
      }
    }
  } catch (e) {
    console.log('获取我收到的好友请求失败', e);
  }
};

const fetchData = async () => {
  loading.value = true;
  try {
    await Promise.all([getAcceptFriendRequestList(), getFriendRequestList()]);
  } finally {
    loading.value = false;
  }
};

let off: (() => void) | undefined;

const stopWatch = () => {
  off?.();
  off = undefined;
};

const startWatch = () => {
  stopWatch();
  if (!props.visible) return;
  fetchData();
  off = subscribe('friend_list_changed', () => {
    fetchData();
  });
};

watch(() => props.visible, startWatch, { immediate: true });
onUnmounted(stopWatch);

const getStatusConfig = (status?: number) => {
  switch (status) {
    case 0:
      return {
        text: t('friendRequest.waiting'),
        className: styles.pendingStatus,
        icon: markRaw(ClockCircleOutlined),
      };
    case 1:
      return {
        text: t('friendRequest.accepted'),
        className: styles.acceptedStatus,
        icon: markRaw(CheckOutlined),
      };
    case 2:
      return {
        text: t('friendRequest.rejected'),
        className: styles.rejectedStatus,
        icon: markRaw(CloseOutlined),
      };
    default:
      return {
        text: t('friendRequest.unknown'),
        className: styles.unknownStatus,
        icon: null,
      };
  }
};

const handleClearAll = async () => {
  await clearUnreadByLevel(1, 1, -1, -1);
  refreshUnreadCounts();
  await fetchData();
};

const update_local_friend_list = async () => {
  try {
    await invoke('update_local_friend_list', {});
  } catch (err) {
    console.log(err);
  }
};

const handleAccept = async (requestUserId: string | undefined) => {
  if (!requestUserId) return;
  const friendRequestInfoDTO: FriendRequestInfoDTO = {
    accept_message: '我通过了你的好友申请',
    request_user: requestUserId,
    add_type: 'card',
    version: 0,
    accept_status: 1,
  };
  const res = await process_friend_request(friendRequestInfoDTO);
  if (res.netSuccess && isHttpSuccess(res.res.status)) {
    await update_local_friend_list();
    await getAcceptFriendRequestList();
  }
};

const handleReject = async (requestUserId: string | undefined) => {
  if (!requestUserId) return;
  const friendRequestInfoDTO: FriendRequestInfoDTO = {
    accept_message: '我拒绝了你的好友申请',
    request_user: requestUserId,
    add_type: 'card',
    version: 0,
    accept_status: 2,
  };
  const res = await process_friend_request(friendRequestInfoDTO);
  if (res.netSuccess && isHttpSuccess(res.res.status)) {
    await update_local_friend_list();
    await getAcceptFriendRequestList();
  }
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return t('friendRequest.unknownTime');
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1
        ? t('friendRequest.justNow')
        : t('friendRequest.minutesAgo', { minutes });
    }
    return t('friendRequest.hoursAgo', { hours });
  } else if (days === 1) {
    return t('friendRequest.yesterday');
  } else if (days < 7) {
    return t('friendRequest.daysAgo', { days });
  }
  return date.toLocaleDateString();
};

const pendingAcceptCount = computed(
  () => acceptRequests.value.filter((r) => r.accept_status === 0).length,
);
</script>

<template>
  <a-modal
    :open="visible"
    :closable="false"
    :footer="null"
    :width="560"
    :class="styles.friendRequestsModal"
    centered
    @cancel="emit('close')"
  >
    <template #title>
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span :class="styles.modalTitle">
          {{ t('friendRequest.title') }}
        </span>
        <a-popconfirm
          title="确定清空所有未读通知？"
          ok-text="确定"
          cancel-text="取消"
          @confirm="handleClearAll"
        >
          <a-button type="text" size="small">
            <template #icon><ClearOutlined /></template>
            清空未读
          </a-button>
        </a-popconfirm>
      </div>
    </template>

    <a-tabs :class="styles.tabs">
      <a-tab-pane key="sent">
        <template #tab>
          <span :class="styles.tabLabel">
            <span>{{ t('friendRequest.sent') }}</span>
            <span v-if="sentRequests.length > 0" :class="styles.badge">
              {{ sentRequests.length }}
            </span>
          </span>
        </template>

        <div :class="styles.requestList">
          <div v-if="sentRequests.length === 0" :class="styles.emptyState">
            <div :class="styles.emptyIcon">📤</div>
            <div :class="styles.emptyText">
              {{ t('friendRequest.noSentRequests') }}
            </div>
          </div>
          <template v-else>
            <div
              v-for="request in sentRequests"
              :key="request.uuid"
              :class="styles.requestItem"
            >
              <div :class="styles.avatarSection">
                <a-avatar
                  :size="52"
                  :src="request.avatarUrl || DEFAULT_ICON"
                  :class="styles.avatar"
                >
                  <template #icon><UserOutlined /></template>
                </a-avatar>
              </div>

              <div :class="styles.contentSection">
                <div :class="styles.header">
                  <div :class="styles.userInfo">
                    <span :class="styles.username">
                      {{
                        request.userInfo?.username ||
                        request.request_user ||
                        t('userInfo.unknown')
                      }}
                      <UserTypeTag :type="request.userInfo?.user_type" />
                    </span>
                    <span
                      v-if="request.userInfo?.account"
                      :class="styles.account"
                    >
                      @{{ request.userInfo.account }}
                    </span>
                  </div>
                  <span
                    :class="[
                      styles.status,
                      getStatusConfig(request.accept_status).className,
                    ]"
                  >
                    <component
                      :is="getStatusConfig(request.accept_status).icon"
                      v-if="getStatusConfig(request.accept_status).icon"
                    />
                    <span>{{
                      getStatusConfig(request.accept_status).text
                    }}</span>
                  </span>
                </div>

                <div v-if="request.userInfo?.info" :class="styles.bio">
                  {{ request.userInfo.info }}
                </div>

                <div :class="styles.message">
                  {{
                    request.request_message ||
                    t('friendRequest.defaultRequestMessage')
                  }}
                </div>

                <div :class="styles.time">
                  {{ formatTime(request.created_at) }}
                </div>
              </div>

              <div :class="styles.actionSection" />
            </div>
          </template>
        </div>
      </a-tab-pane>

      <a-tab-pane key="received">
        <template #tab>
          <span :class="styles.tabLabel">
            <span>{{ t('friendRequest.received') }}</span>
            <span v-if="pendingAcceptCount > 0" :class="styles.badge">
              {{ pendingAcceptCount }}
            </span>
          </span>
        </template>

        <div :class="styles.requestList">
          <div v-if="acceptRequests.length === 0" :class="styles.emptyState">
            <div :class="styles.emptyIcon">📥</div>
            <div :class="styles.emptyText">
              {{ t('friendRequest.noReceivedRequests') }}
            </div>
          </div>
          <template v-else>
            <div
              v-for="request in acceptRequests"
              :key="request.uuid"
              :class="styles.requestItem"
            >
              <div :class="styles.avatarSection">
                <a-avatar
                  :size="52"
                  :src="request.avatarUrl || DEFAULT_ICON"
                  :class="styles.avatar"
                >
                  <template #icon><UserOutlined /></template>
                </a-avatar>
              </div>

              <div :class="styles.contentSection">
                <div :class="styles.header">
                  <div :class="styles.userInfo">
                    <span :class="styles.username">
                      {{
                        request.userInfo?.username ||
                        request.request_user ||
                        t('userInfo.unknown')
                      }}
                      <UserTypeTag :type="request.userInfo?.user_type" />
                    </span>
                    <span
                      v-if="request.userInfo?.account"
                      :class="styles.account"
                    >
                      @{{ request.userInfo.account }}
                    </span>
                  </div>
                  <span
                    :class="[
                      styles.status,
                      getStatusConfig(request.accept_status).className,
                    ]"
                  >
                    <component
                      :is="getStatusConfig(request.accept_status).icon"
                      v-if="getStatusConfig(request.accept_status).icon"
                    />
                    <span>{{
                      getStatusConfig(request.accept_status).text
                    }}</span>
                  </span>
                </div>

                <div v-if="request.userInfo?.info" :class="styles.bio">
                  {{ request.userInfo.info }}
                </div>

                <div :class="styles.message">
                  {{
                    request.request_message ||
                    t('friendRequest.defaultRequestMessage')
                  }}
                </div>

                <div :class="styles.time">
                  {{ formatTime(request.created_at) }}
                </div>
              </div>

              <div :class="styles.actionSection">
                <div
                  v-if="request.accept_status === 0"
                  :class="styles.actionButtons"
                >
                  <a-button
                    type="primary"
                    :class="styles.acceptBtn"
                    @click="handleAccept(request.request_user)"
                  >
                    <template #icon><CheckOutlined /></template>
                    {{ t('friendRequest.accept') }}
                  </a-button>
                  <a-button
                    :class="styles.rejectBtn"
                    @click="handleReject(request.request_user)"
                  >
                    <template #icon><CloseOutlined /></template>
                    {{ t('friendRequest.reject') }}
                  </a-button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </a-tab-pane>
    </a-tabs>
  </a-modal>
</template>
