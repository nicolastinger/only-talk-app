<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatSession } from '@/hooks/useChatSession';
import MessageBox from '@/pages/Home/Chats/components/MessageBox.vue';
import Search from '@/pages/Home/Chats/components/Search.vue';
import { useBearStore } from '@/stores/app';
import { invoke } from '@tauri-apps/api/core';
import { clearAllUnreadSessions } from '@workspace/services';
import type { ChatSessionVo } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBearStore();

const chatSessionList = ref<ChatSessionVo[]>([]);
const selectedSessionKey = ref<string>('');
const contextMenu = ref<{
  x: number;
  y: number;
  item: ChatSessionVo;
} | null>(null);

const userInfo = computed(() => store.userInfo);
const { chatSessionEvent } = useChatSession(() => store.userInfo.uuid);

watch(
  () => route.query,
  (query) => {
    const currentFriend = query.currentFriend as string | undefined;
    const selfUuid = query.selfUuid as string | undefined;
    const groupId = query.groupId as string | undefined;

    if (currentFriend) {
      selectedSessionKey.value = currentFriend;
    } else if (selfUuid) {
      selectedSessionKey.value = selfUuid;
    } else if (groupId) {
      selectedSessionKey.value = groupId;
    }
  },
  { immediate: true, deep: true },
);

const routeToChat = (item: ChatSessionVo) => {
  if (item.session_type === 2) {
    const groupId = item.group_id || item.send_user;
    router.push('/home/chats/group-chat?groupId=' + groupId);
    return;
  }
  if (item.send_user === item.recv_user) {
    router.push('/home/chats/self-chat?selfUuid=' + item.send_user);
    return;
  }
  const uuid =
    item.send_user === userInfo.value?.uuid ? item.recv_user : item.send_user;
  router.push('/home/chats/chat?currentFriend=' + uuid);
};

watch(chatSessionEvent, (event) => {
  console.log('本次chatSessionEvent', event);
  if (!event?.data) {
    return;
  }

  const prevList = chatSessionList.value;
  console.log('prevList', prevList);

  const index = prevList.findIndex((item) => {
    if (
      item.send_user === event.data.send_user &&
      item.recv_user === event.data.recv_user
    ) {
      return true;
    } else if (
      item.send_user === event.data.recv_user &&
      item.recv_user === event.data.send_user
    ) {
      return true;
    } else {
      return false;
    }
  });

  console.log('index', index);
  const newList = [...prevList];

  const friend_icon = newList[index]?.friend_icon;
  const friend_name = newList[index]?.friend_name;
  if (event.type === 0) {
    if (index !== -1) {
      newList[index] = event.data;
      newList[index] = {
        ...newList[index],
        friend_icon: friend_icon,
        friend_name: friend_name,
      };
    } else {
      newList.push(event.data);
    }
  } else {
    if (index !== -1) {
      newList[index] = {
        ...newList[index],
        unread_count: newList[index].unread_count + 1,
        last_message: event.data.last_message,
        timestamp: event.data.timestamp,
        is_show: event.data.is_show,
        is_top: event.data.is_top,
        nano_id: event.data.nano_id,
        session_type: event.data.session_type,
        text_type: event.data.text_type,
        friend_icon: newList[index].friend_icon,
      };
    } else {
      newList.push(event.data);
    }
  }

  chatSessionList.value = newList.sort((a, b) => b.timestamp - a.timestamp);
});

const get_chat_session = async () => {
  try {
    const res = (await invoke(
      'get_chat_session_from_store',
      {},
    )) as ChatSessionVo[];
    console.log('get_chat_session', res);
    const sortedList = res.sort((a, b) => b.timestamp - a.timestamp);
    chatSessionList.value = sortedList;
  } catch (e) {
    console.log(e);
  }
};

onMounted(() => {
  get_chat_session();
});

watch(
  () => store.refreshFlag,
  (refreshFlag) => {
    if (refreshFlag > 0) {
      get_chat_session();
    }
  },
);

const closeContextMenu = () => {
  contextMenu.value = null;
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeContextMenu();
};

watch(contextMenu, (menu) => {
  if (!menu) return;
  window.addEventListener('click', closeContextMenu);
  window.addEventListener('scroll', closeContextMenu, true);
  window.addEventListener('keydown', onKey);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('scroll', closeContextMenu, true);
  window.removeEventListener('keydown', onKey);
});

watch(chatSessionList, (list) => {
  console.log('chatSessionList', list);
});

const handleClearAllUnread = async () => {
  await clearAllUnreadSessions();
  await get_chat_session();
};

const handleHideSession = async (item: ChatSessionVo) => {
  try {
    await invoke('hide_chat_session', {
      sendUser: item.send_user,
      recvUser: item.recv_user,
    });
    chatSessionList.value = chatSessionList.value.filter(
      (s) =>
        !(s.send_user === item.send_user && s.recv_user === item.recv_user),
    );
    const sessionKey =
      item.send_user === item.recv_user
        ? item.send_user
        : item.send_user === userInfo.value?.uuid
          ? item.recv_user
          : item.send_user;
    if (sessionKey === selectedSessionKey.value) {
      selectedSessionKey.value = '';
    }
  } catch (e) {
    console.error('隐藏会话失败:', e);
  }
};

const openContextMenu = (e: MouseEvent, item: ChatSessionVo) => {
  e.preventDefault();
  contextMenu.value = { x: e.clientX, y: e.clientY, item };
};

const handleContextMenuHide = (e: MouseEvent) => {
  e.stopPropagation();
  const item = contextMenu.value?.item;
  contextMenu.value = null;
  if (item) handleHideSession(item);
};

const sessionKeyOf = (item: ChatSessionVo) =>
  item.send_user === item.recv_user
    ? item.send_user
    : item.send_user === userInfo.value?.uuid
      ? item.recv_user
      : item.send_user;
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.left" style="flex: 0 0 32%">
      <div style="height: 100%">
        <div :class="styles.header">
          <Search @select="(item) => routeToChat(item)" />
          <a-popconfirm
            :title="t('chatsLayout.clearUnreadConfirm')"
            :ok-text="t('chatsLayout.confirm')"
            :cancel-text="t('chatsLayout.cancel')"
            @confirm="handleClearAllUnread"
          >
            <a-button
              type="text"
              :class="styles.clearBtn"
              :title="t('chatsLayout.clearUnread')"
            >
              <template #icon>
                <svg
                  :class="styles.clearIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <line x1="18" y1="2" x2="22" y2="6" />
                  <line x1="22" y1="2" x2="18" y2="6" />
                </svg>
              </template>
            </a-button>
          </a-popconfirm>
        </div>
        <div :class="styles.item" key="chat">
          <div
            v-for="item in chatSessionList"
            :key="item.nano_id"
            :class="styles.sessionItem"
            @click="routeToChat(item)"
            @contextmenu="openContextMenu($event, item)"
          >
            <MessageBox
              :message="item.last_message"
              :img="item.friend_icon"
              :time="item.timestamp"
              :title="item.friend_name"
              :user-type="item.friend_user_type"
              :is-group="item.session_type === 2"
              :count="item.unread_count"
              :text-type="item.text_type"
              :send-user="item.send_user"
              :recv-user="item.recv_user"
              :is-selected="selectedSessionKey === sessionKeyOf(item)"
            />
          </div>
        </div>
      </div>
    </div>
    <div :class="styles.right" style="width: auto; flex: 1; min-width: 0">
      <!-- query 变化(切换好友/群聊)时强制重建页面，避免聊天监听仍指向旧会话 -->
      <router-view :key="route.fullPath" />
    </div>
    <div
      v-if="contextMenu"
      :class="styles.contextMenu"
      :style="{ left: contextMenu.x, top: contextMenu.y }"
      @click.stop
    >
      <div :class="styles.contextMenuItem" @click="handleContextMenuHide">
        <svg
          :class="styles.deleteIcon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z" />
          <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
        <span>{{ t('chatsLayout.hideSession') }}</span>
      </div>
    </div>
  </div>
</template>
