<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  isMessageSelectable,
  useMessageSelection,
} from '@/hooks/useMessageSelection';
import { useBearStore } from '@/stores/app';
import { collectCopyableText } from '@/utils/messageText';
import { feedback } from '@/utils/feedback';
import { invoke } from '@tauri-apps/api/core';
import { listenChatFileUploadProgress } from '@workspace/services';
import {
  MessageFrom,
  type ChatMessage,
  type Page,
  type ResponseData,
  type TextQuicMsgVo,
} from '@workspace/types';
import ForwardModal from '../components/ForwardModal.vue';
import MessageActionMenu from '../components/MessageActionMenu.vue';
import MessageList from '../components/MessageList.vue';
import MessageSelectionBar from '../components/MessageSelectionBar.vue';
import Splitter from '../components/Splitter.vue';
import SelfChatFooter from './components/SelfChatFooter.vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

type ForwardTarget = {
  recv: string;
  isGroup: boolean;
  name: string;
};

type MessageAction = 'multi' | 'forward' | 'recall' | 'delete' | 'copy';

const PAGE_SIZE = 20;

/**
 * SelfChat 页面 - 自己给自己发送消息的聊天窗口
 * 与普通聊天窗口的区别：
 * 1. 隐藏 customer 消息（所有消息都是自己发的）
 * 2. 隐藏隐私窗口和 WebRTC 功能按钮
 * 3. TopBar 只显示标题，没有好友操作菜单
 */
const { t } = useI18n();
const route = useRoute();
const store = useBearStore();

const messageList = ref<ChatMessage[]>([]);
const footerHeight = ref(180);
const realFootHeight = ref(186);
const currentPage = ref(1);
const hasMore = ref(true);
const isLoading = ref(false);
const isInitialLoad = ref(true);
const newMessageIds = ref<Set<string>>(new Set());
const loadedMessageIds = ref<Set<string>>(new Set());
const uploadProgressMap = ref<Record<string, { percent: number; phase: string }>>({});

const messageContainerRef = ref<HTMLDivElement>();
const selfUuid = computed(() => String(route.query.selfUuid || ''));

const meUuid = computed(() => store.userInfo.uuid || '');
const userInfo = computed(() => store.userInfo);

/* 供下方 effect / 回调引用, 提前声明以满足 no-use-before-define */
const scrollToBottom = () => {
  const container = messageContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

// 会话级已读：进入 SelfChat 即清掉该会话未读（与单聊页 markReadFriend 对齐）。
// 自己给自己的消息天然已读，不需要按条上报已读水位。
const markReadSession = async () => {
  if (!selfUuid.value) return;
  try {
    const data: ResponseData = await invoke('mark_read_chat_session', {
      friendUuid: selfUuid.value,
    });
    console.log('已读自己会话', data);
  } catch (err) {
    console.log(err);
  }
};

const setCurrentFriendSession = async (friend: string) => {
  try {
    const res = await invoke('add_user_map', {
      map: {
        current_session_friend: friend,
      },
    });
    console.log('设置当前好友会话', res);
  } catch (err) {
    console.log(err);
  }
};

const loadChatRecordFromStore = async (
  me: string,
  friend: string,
  page: number,
  isInitial = false,
) => {
  if (isLoading.value) return;

  isLoading.value = true;
  try {
    const textRawText: TextQuicMsgVo = {
      nano_id: '',
      raw: '',
      recv_user: me,
      send_user: friend,
      text_type: 0,
      timestamp: 0,
    };
    const pageParam: Page = {
      size: PAGE_SIZE,
      current: page,
      total: 0,
    };
    const data: TextQuicMsgVo[] = await invoke('get_chat_record_from_store', {
      textQuicMsg: textRawText,
      page: pageParam,
    });

    if (data.length === 0) {
      hasMore.value = false;
      return;
    }

    const chatMessages: ChatMessage[] = data.map((item) => {
      // 自己给自己的消息，所有消息都是 Mine
      const from = MessageFrom.Mine;
      const temp: ChatMessage = {
        from,
        text_msg_raw: item,
        ack: undefined,
      };
      return temp;
    });

    if (isInitial) {
      messageList.value = chatMessages;
      isInitialLoad.value = false;
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      // 进入会话即视为已读（自己给自己的消息不需要按条上报水位）
      markReadSession();
    } else {
      const container = messageContainerRef.value;
      const prevScrollHeight = container?.scrollHeight || 0;

      const newIds = new Set(chatMessages.map((msg) => msg.text_msg_raw.nano_id));
      loadedMessageIds.value = newIds;

      messageList.value = [...chatMessages, ...messageList.value];

      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight;
        }
      }, 0);

      setTimeout(() => {
        loadedMessageIds.value = new Set();
      }, 300);
    }

    if (data.length < PAGE_SIZE) {
      hasMore.value = false;
    }
  } catch (err) {
    console.log(err);
  } finally {
    isLoading.value = false;
  }
};

/* ===== 多选 / 删除 / 转发 ===== */
const {
  selectMode,
  selectedIds,
  selectedMessages,
  allSelected,
  enterSelect,
  exitSelect,
  toggle,
  toggleAll,
} = useMessageSelection(messageList);

const actionMenu = ref<{ x: number; y: number; msg: ChatMessage } | null>(null);
const forwardOpen = ref(false);
const forwardMessages = ref<ChatMessage[]>([]);

const handleMessageContext = (msg: ChatMessage, e: MouseEvent) => {
  if (!isMessageSelectable(msg)) return;
  e.preventDefault();
  e.stopPropagation();
  actionMenu.value = { x: e.clientX, y: e.clientY, msg };
};

const handleToggleSelect = (msg: ChatMessage) => toggle(msg);

const copyMessage = async (msg: ChatMessage) => {
  if (msg.text_msg_raw.text_type !== 1) return;
  try {
    const parsed = JSON.parse(msg.text_msg_raw.raw);
    const text = parsed.text || parsed.content || '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
    feedback.message.success(t('chat.messageActions.copied'));
  } catch (err) {
    console.error(err);
  }
};

const copySelected = async () => {
  const text = collectCopyableText(
    selectedMessages.value.map((m) => m.text_msg_raw),
  );
  if (!text) {
    feedback.message.info(t('chat.noCopyableText'));
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    feedback.message.success(t('chat.messageActions.copied'));
    exitSelect();
  } catch (err) {
    console.error(err);
    feedback.message.error(t('chat.copyFailed'));
  }
};

const deleteMessages = async (ids: string[]) => {
  if (ids.length === 0) return;
  try {
    await invoke('delete_chat_record', { nanoIdList: ids });
  } catch (err) {
    console.error(err);
    feedback.message.error(t('chat.deleteConfirm.failed'));
    return;
  }
  messageList.value = messageList.value.filter(
    (m) => !ids.includes(m.text_msg_raw.nano_id),
  );
  exitSelect();
};

const confirmDelete = (ids: string[]) => {
  if (ids.length === 0) return;
  feedback.modal.confirm({
    title: t('chat.deleteConfirm.title'),
    content: t('chat.deleteConfirm.content', { count: ids.length }),
    okText: t('chat.messageActions.delete'),
    okButtonProps: { danger: true },
    cancelText: t('chat.messageActions.cancel'),
    onOk: () => deleteMessages(ids),
  });
};

const openForward = (msgs: ChatMessage[]) => {
  if (msgs.length === 0) return;
  forwardMessages.value = msgs;
  forwardOpen.value = true;
};

const handleForwardConfirm = async (target: ForwardTarget) => {
  const list = forwardMessages.value.map((m) => m.text_msg_raw);
  forwardOpen.value = false;
  if (list.length === 0) return;
  try {
    await invoke('forward_chat_messages', {
      messages: list,
      targetRecv: target.recv,
      targetGroup: target.isGroup,
    });
    feedback.message.success(t('chat.forward.success', { name: target.name }));
    if (!target.isGroup && target.recv === selfUuid.value) {
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecordFromStore(meUuid.value, selfUuid.value, 1, true);
    }
    exitSelect();
  } catch (err) {
    console.error(err);
    feedback.message.error(t('chat.forward.failed'));
  }
};

const handleActionMenuSelect = (action: MessageAction) => {
  const msg = actionMenu.value?.msg;
  actionMenu.value = null;
  if (!msg) return;
  if (action === 'multi') {
    enterSelect(msg);
  } else if (action === 'forward') {
    openForward([msg]);
  } else if (action === 'delete') {
    confirmDelete([msg.text_msg_raw.nano_id]);
  } else if (action === 'copy') {
    copyMessage(msg);
  }
};
// SelfChat 不需要监听 textMessage，因为所有消息都通过 handleMessageSent 添加
// useMessageApi 监听的是 send_user === selfUuid 的消息，这会导致自己发的消息重复

const handleHeightChange = (heightPercent: number) => {
  const containerHeight = window.innerHeight;
  const minHeightPx = 20;
  const maxHeightPx = containerHeight * 0.8;
  const heightPx = Math.max(
    minHeightPx,
    Math.min(maxHeightPx, (heightPercent / 100) * containerHeight),
  );
  footerHeight.value = heightPx;
};

watch(footerHeight, (height) => {
  realFootHeight.value = height + 6;
});

let unlistenUpload: (() => void) | undefined;
let disposed = false;

const setupChat = () => {
  // 切换会话时先清理上一轮监听，避免重复绑定
  unlistenUpload?.();
  unlistenUpload = undefined;

  currentPage.value = 1;
  hasMore.value = true;
  isInitialLoad.value = true;
  messageList.value = [];
  loadChatRecordFromStore(meUuid.value, selfUuid.value, 1, true);
  setCurrentFriendSession(selfUuid.value);

  disposed = false;
  listenChatFileUploadProgress((p) => {
    const pct =
      p.total > 0 ? Math.min(99, Math.floor((p.uploaded / p.total) * 100)) : 0;
    uploadProgressMap.value = {
      ...uploadProgressMap.value,
      [p.nanoId]: { percent: pct, phase: p.phase },
    };
  })
    .then((fn) => {
      if (disposed) fn();
      else unlistenUpload = fn;
    })
    .catch(() => {});
};

watch(
  [meUuid, selfUuid],
  () => {
    setupChat();
  },
  { immediate: true },
);

onUnmounted(() => {
  disposed = true;
  setCurrentFriendSession('-1');
  unlistenUpload?.();
  const container = messageContainerRef.value;
  container?.removeEventListener('scroll', handleScroll);
});

const handleScroll = () => {
  const container = messageContainerRef.value;
  if (!container || isLoading.value || !hasMore.value || isInitialLoad.value)
    return;

  if (container.scrollTop <= 50) {
    const nextPage = currentPage.value + 1;
    currentPage.value = nextPage;
    loadChatRecordFromStore(meUuid.value, selfUuid.value, nextPage, false);
  }
};

onMounted(() => {
  const container = messageContainerRef.value;
  container?.addEventListener('scroll', handleScroll);
});

// SelfChat 不需要处理 textMessage，所有消息通过 handleMessageSent 添加

const handleMessageSent = (messageStr: string) => {
  const temp: ChatMessage = JSON.parse(messageStr);
  const nanoId = temp.text_msg_raw.nano_id;
  newMessageIds.value = new Set([nanoId]);
  // 幂等上屏：同一 nano_id 只追加一次（补发/回推/重复回调都不会重复渲染）
  if (
    !messageList.value.some((item) => item.text_msg_raw.nano_id === nanoId)
  ) {
    messageList.value = [...messageList.value, temp];
  }
  setTimeout(() => {
    scrollToBottom();
  }, 100);
  setTimeout(() => {
    newMessageIds.value = new Set();
  }, 300);
};

const handleActionMenuClose = () => {
  actionMenu.value = null;
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.header">
      <div :class="styles.headerTitle">
        <span :class="styles.selfChatIcon">📝</span>
        <span>
          {{ userInfo?.username || t('chat.selfChat.me') }} -
          {{ t('chat.selfChat.notes') }}
        </span>
      </div>
    </div>
    <div :class="styles.mainContainer">
      <div
        ref="messageContainerRef"
        :class="styles.messageContainer"
        :style="{
          height: selectMode
            ? 'calc(100% - 50px)'
            : `calc(100% - ${realFootHeight}px)`,
        }"
      >
        <div v-if="isLoading && !isInitialLoad" :class="styles.loadingIndicator">
          <div :class="styles.loadingSpinner"></div>
          <span>{{ t('chat.loading') }}</span>
        </div>
        <div v-if="!hasMore && messageList.length > 0" :class="styles.noMoreIndicator">
          {{ t('chat.noMoreMessages') }}
        </div>
        <MessageList
          :messages="messageList"
          :friend-icon="userInfo?.icon"
          :friend-uuid="selfUuid"
          :new-message-ids="newMessageIds"
          :loaded-message-ids="loadedMessageIds"
          :select-mode="selectMode"
          :selected-ids="selectedIds"
          :upload-progress-map="uploadProgressMap"
          @message-context="handleMessageContext"
          @toggle-select="handleToggleSelect"
        />
        <div id="anchor"></div>
      </div>
      <MessageSelectionBar
        v-if="selectMode"
        :count="selectedIds.size"
        :all-selected="allSelected"
        @toggle-all="toggleAll"
        @cancel="exitSelect"
        @copy="copySelected"
        @forward="() => openForward(selectedMessages)"
        @delete="() => confirmDelete([...selectedIds])"
      />
      <template v-else>
        <Splitter :min-height="20" :max-height="80" @height-change="handleHeightChange" />
        <div :style="{ height: `${footerHeight}px` }">
          <SelfChatFooter :self-uuid="selfUuid" @message-sent="handleMessageSent" />
        </div>
      </template>
    </div>
    <MessageActionMenu
      v-if="actionMenu"
      :x="actionMenu.x"
      :y="actionMenu.y"
      :can-copy="actionMenu.msg.text_msg_raw.text_type === 1"
      @select="handleActionMenuSelect"
      @close="handleActionMenuClose"
    />
    <ForwardModal
      :open="forwardOpen"
      :count="forwardMessages.length"
      @cancel="forwardOpen = false"
      @confirm="handleForwardConfirm"
    />
  </div>
</template>
