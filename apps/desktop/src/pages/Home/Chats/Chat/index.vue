<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { SYSTEM_ACCOUNT } from '@/constants';
import { useChatBackground } from '@/hooks/useChatBackground';
import { useMessageApi } from '@/hooks/useMessageApi';
import {
  isMessageSelectable,
  useMessageSelection,
} from '@/hooks/useMessageSelection';
import { useBearStore } from '@/stores/app';
import { collectCopyableText } from '@/utils/messageText';
import { isRecallChatMessage, isRecallMessage } from '@/utils/recall';
import { feedback } from '@/utils/feedback';
import { invoke } from '@tauri-apps/api/core';
import { listenChatFileUploadProgress } from '@workspace/services';
import {
  MessageFrom,
  type ChatMessage,
  type FriendVo,
  type Page,
  type ResponseData,
  type TextQuicMsgVo,
} from '@workspace/types';
import ChatFooter from '../components/Footer.vue';
import ForwardModal from '../components/ForwardModal.vue';
import MessageActionMenu from '../components/MessageActionMenu.vue';
import MessageList from '../components/MessageList.vue';
import MessageSelectionBar from '../components/MessageSelectionBar.vue';
import PendingSendBar from '../components/PendingSendBar.vue';
import Splitter from '../components/Splitter.vue';
import ChatTopBar from '../components/TopBar.vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

type ForwardTarget = {
  recv: string;
  isGroup: boolean;
  name: string;
};

type MessageAction = 'multi' | 'forward' | 'recall' | 'delete' | 'copy';

const PAGE_SIZE = 20;

/** 瞬态消息(通话控制 12-15 / WebRTC 信令 100)：新生命周期下不入聊天历史，
 *  历史由自动生成的 type=1 文本记录承担；仅过滤历史遗留旧数据，避免重复渲染。 */
const isTransientType = (textType: number): boolean =>
  textType === 12 ||
  textType === 13 ||
  textType === 14 ||
  textType === 15 ||
  textType === 100;

const { t } = useI18n();
const route = useRoute();
const store = useBearStore();

const messageList = ref<ChatMessage[]>([]);
const currentFriend = ref<FriendVo>();
const footerHeight = ref(180);
const currentPage = ref(1);
const hasMore = ref(true);
const isLoading = ref(false);
const isInitialLoad = ref(true);
const newMessageIds = ref<Set<string>>(new Set());
const loadedMessageIds = ref<Set<string>>(new Set());
const isUploading = ref(false);
const uploadPercent = ref(0);
const uploadProgressMap = ref<Record<string, { percent: number; phase: string }>>({});
/** 正在上传的乐观消息 nano_id：上传期间不计入 ACK 超时，上传完成后才开始等待回执 */
const uploadingIds = ref<Set<string>>(new Set());
const pendingBarVisible = ref(false);
const pendingRefreshSignal = ref(0);

const messageContainerRef = ref<HTMLDivElement>();
const friendUuid = computed(() => String(route.query.currentFriend || ''));
const meUuid = computed(() => store.userInfo.uuid || '');

/* 供下方 effect / 回调引用, 提前声明以满足 no-use-before-define */
const scrollToBottom = () => {
  const container = messageContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

const markRead = async (last_read_record: string) => {
  try {
    const lastList: string[] = [];
    if (last_read_record) {
      lastList.push(last_read_record);
    }
    const data: ResponseData = await invoke('mark_read', {
      textQuicVec: lastList,
    });
    console.log('已读', data);
  } catch (err) {
    console.log(err);
  }
};

const markReadFriend = async (uuid: string) => {
  if (!uuid) {
    return;
  }
  try {
    const data: ResponseData = await invoke('mark_read_chat_session', {
      friendUuid: uuid,
    });
    console.log('已读好友会话', data);
  } catch (err) {
    console.log(err);
  }
};

const getFriendInfo = async (uuid: string) => {
  try {
    const data: FriendVo = await invoke('get_friend_info', {
      friendUuid: uuid,
    });
    console.log('好友信息', data);
    currentFriend.value = data;
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

    const chatMessages: ChatMessage[] = data
      .filter((item) => !isTransientType(item.text_type))
      .map((item) => {
        const from =
          item.send_user === me ? MessageFrom.Mine : MessageFrom.Friend;
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
      if (chatMessages.length > 0) {
        const last_read_record = chatMessages.reduce((latest, current) =>
          latest.text_msg_raw.timestamp > current.text_msg_raw.timestamp
            ? latest
            : current,
        )?.text_msg_raw.nano_id;
        markRead(last_read_record);
      }
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

const recallMessage = async (msg: ChatMessage) => {
  let recalled: TextQuicMsgVo;
  try {
    recalled = (await invoke('recall_chat_message', {
      recvUser: friendUuid.value,
      targetNanoId: msg.text_msg_raw.nano_id,
    })) as TextQuicMsgVo;
  } catch (err) {
    console.error(err);
    feedback.message.error(t('chat.recall.failed'));
    return;
  }
  const filtered = messageList.value.filter(
    (m) => m.text_msg_raw.nano_id !== msg.text_msg_raw.nano_id,
  );
  const temp: ChatMessage = {
    from: MessageFrom.Mine,
    text_msg_raw: recalled,
    ack: false,
  };
  messageList.value = [...filtered, temp];
  setTimeout(() => scrollToBottom(), 100);
};

const confirmRecall = (msg: ChatMessage) => {
  feedback.modal.confirm({
    title: t('chat.messageActions.recall'),
    content: t('chat.recall.confirm'),
    okText: t('chat.messageActions.recall'),
    cancelText: t('chat.messageActions.cancel'),
    onOk: () => recallMessage(msg),
  });
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
    if (!target.isGroup && target.recv === friendUuid.value) {
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecordFromStore(meUuid.value, friendUuid.value, 1, true);
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
  } else if (action === 'recall') {
    confirmRecall(msg);
  } else if (action === 'delete') {
    confirmDelete([msg.text_msg_raw.nano_id]);
  } else if (action === 'copy') {
    copyMessage(msg);
  }
};

const { textMessage } = useMessageApi(
  () => friendUuid.value,
  () => meUuid.value,
);
// 聊天背景(仅客户端): 有自定义背景时拉伸铺满, 否则保持主题渐变
const chatBackgroundUrl = useChatBackground(friendUuid.value);

const chatBackgroundStyle = computed(() =>
  chatBackgroundUrl.value
    ? {
        backgroundImage: `url("${chatBackgroundUrl.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : undefined,
);

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

watch(messageList, () => {
  if (messageList.value.length > 1) {
    const last_message = messageList.value[messageList.value.length - 1];
    const last_nano_id = last_message.text_msg_raw.nano_id;
    if (last_nano_id !== '' && last_message.ack === undefined) {
      console.log('已读', messageList.value);
      markRead(last_nano_id);
    }
  }
});

const handleUploadStartEvent = () => {
  isUploading.value = true;
  uploadPercent.value = 0;
};
const handleUploadEndEvent = () => {
  uploadPercent.value = 100;
  isUploading.value = false;
};

let unlistenUpload: (() => void) | undefined;
let disposed = false;

const setupChat = () => {
  // 切换会话时先清理上一轮监听，避免重复绑定
  window.removeEventListener('uploadStart', handleUploadStartEvent);
  window.removeEventListener('uploadEnd', handleUploadEndEvent);
  unlistenUpload?.();
  unlistenUpload = undefined;

  currentPage.value = 1;
  hasMore.value = true;
  isInitialLoad.value = true;
  messageList.value = [];
  loadChatRecordFromStore(meUuid.value, friendUuid.value, 1, true);
  getFriendInfo(friendUuid.value);
  markReadFriend(friendUuid.value);
  setCurrentFriendSession(friendUuid.value);

  window.addEventListener('uploadStart', handleUploadStartEvent);
  window.addEventListener('uploadEnd', handleUploadEndEvent);

  disposed = false;
  listenChatFileUploadProgress((p) => {
    const pct =
      p.total > 0 ? Math.min(99, Math.floor((p.uploaded / p.total) * 100)) : 0;
    uploadPercent.value = pct;
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
  [meUuid, friendUuid],
  () => {
    setupChat();
  },
  { immediate: true },
);

onUnmounted(() => {
  disposed = true;
  setCurrentFriendSession('-1');
  window.removeEventListener('uploadStart', handleUploadStartEvent);
  window.removeEventListener('uploadEnd', handleUploadEndEvent);
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
    loadChatRecordFromStore(meUuid.value, friendUuid.value, nextPage, false);
  }
};

onMounted(() => {
  const container = messageContainerRef.value;
  container?.addEventListener('scroll', handleScroll);
});

watch(textMessage, (incoming) => {
  if (!incoming) return;
  // 撤回消息：被撤回的原消息已在本地库删除，重拉聊天记录以移除原消息并显示撤回提示
  if (isRecallMessage(incoming.text_type, incoming.raw)) {
    currentPage.value = 1;
    hasMore.value = true;
    isInitialLoad.value = true;
    loadChatRecordFromStore(meUuid.value, friendUuid.value, 1, true);
    return;
  }
  // 实时消息：通话控制(12-15)/信令(100) 走独立事件 call_control/webrtc_signal，
  // 不会进入 text_message，此处仅处理文本/图片/文件等历史消息类型。
  let from = MessageFrom.Customer;
  if (incoming.send_user === SYSTEM_ACCOUNT) {
    from = MessageFrom.System;
  } else if (incoming.send_user === meUuid.value) {
    // 自己其他端发送的消息(self-echo)回推, 渲染为己方气泡
    from = MessageFrom.Mine;
  }
  const temp: ChatMessage = {
    from,
    text_msg_raw: incoming,
    ack: undefined,
  };
  if (incoming.text_type === 201) {
    const index = messageList.value.findIndex(
      (item) => item.text_msg_raw.nano_id === incoming.raw,
    );
    if (index === -1) {
      // 列表中没有该消息：重发/补发成功的消息此前从未落库渲染过，
      // 重新加载最新聊天记录让新落库的气泡出现（否则需重进会话才可见）
      console.log('ACK 消息不在列表中（重发/补发成功），重新加载聊天记录');
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecordFromStore(meUuid.value, friendUuid.value, 1, true);
      return;
    }

    const ackedMessage = messageList.value[index];
    const ackedMessageType = ackedMessage.text_msg_raw.text_type;
    // 用服务端返回的 nano_id 归一本地乐观消息的 nano_id，
    // 否则后续撤回/删除/已读会因本地 id 在 chat_record 中不存在而失败
    const nextList = [...messageList.value];
    nextList[index] = {
      ...ackedMessage,
      text_msg_raw: {
        ...ackedMessage.text_msg_raw,
        nano_id: incoming.nano_id || ackedMessage.text_msg_raw.nano_id,
      },
      ack: true,
    };
    messageList.value = nextList;

    // 检查被 ack 的消息是否是图片(text_type=2)/文件(text_type=3)/语音(text_type=21)
    if (ackedMessageType === 2 || ackedMessageType === 3 || ackedMessageType === 21) {
      // 重新加载当前窗口的聊天记录
      console.log(
        `检测到图片/文件/语音消息 ${
          ackedMessageType === 2
            ? '图片'
            : ackedMessageType === 3
              ? '文件'
              : '语音'
        } 的ack，重新加载聊天记录`,
      );
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecordFromStore(meUuid.value, friendUuid.value, 1, true);
    }
    // ACK 只是回执, 本身不是一条聊天气泡, 不追加进列表
    // 201 ACK 到达，send 表对应记录状态置 3，刷新待发送记录条
    pendingRefreshSignal.value += 1;
  } else {
    // 幂等上屏：同一条消息(重复投递 / self-echo / 补发)只渲染一次
    if (
      !messageList.value.some(
        (item) => item.text_msg_raw.nano_id === incoming.nano_id,
      )
    ) {
      messageList.value = [...messageList.value, temp];
    }
    newMessageIds.value = new Set([incoming.nano_id]);
    setTimeout(() => {
      newMessageIds.value = new Set();
    }, 300);
  }
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

const handleMessageSent = (messageStr: string) => {
  const temp: ChatMessage = JSON.parse(messageStr);
  newMessageIds.value = new Set([temp.text_msg_raw.nano_id]);
  messageList.value = [...messageList.value, temp];
  // 新消息已进 send 队列，刷新待发送记录条
  pendingRefreshSignal.value += 1;
  setTimeout(() => {
    scrollToBottom();
  }, 100);
  setTimeout(() => {
    newMessageIds.value = new Set();
  }, 300);
};

const handleUploadStart = (nanoId?: string) => {
  isUploading.value = true;
  uploadPercent.value = 0;
  if (nanoId) {
    const next = new Set(uploadingIds.value);
    next.add(nanoId);
    uploadingIds.value = next;
  }
};

const handleUploadEnd = (nanoId?: string) => {
  uploadPercent.value = 100;
  isUploading.value = false;
  if (nanoId) {
    if (!uploadingIds.value.has(nanoId)) return;
    const next = new Set(uploadingIds.value);
    next.delete(nanoId);
    uploadingIds.value = next;
  }
};

const handleActionMenuClose = () => {
  actionMenu.value = null;
};
</script>

<template>
  <div :class="styles.container" :style="chatBackgroundStyle">
    <div :class="styles.header">
      <ChatTopBar
        :title="currentFriend?.friend_name || ''"
        :friend-info="currentFriend"
      />
      <div v-if="isUploading" :class="styles.uploadLoadingBar">
        <div v-if="uploadPercent === 0" :class="styles.uploadLoadingIndeterminate" />
        <div
          v-else
          :class="styles.uploadLoadingProgress"
          :style="{ width: `${uploadPercent}%` }"
        />
      </div>
    </div>
    <div :class="styles.mainContainer">
      <div
        ref="messageContainerRef"
        :class="styles.messageContainer"
        :style="{
          height: selectMode
            ? 'calc(100% - 50px)'
            : `calc(100% - ${footerHeight + 6}px)`,
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
          :friend-icon="currentFriend?.friend_icon"
          :friend-uuid="friendUuid"
          :friend-name="currentFriend?.friend_name"
          :new-message-ids="newMessageIds"
          :loaded-message-ids="loadedMessageIds"
          :select-mode="selectMode"
          :selected-ids="selectedIds"
          :upload-progress-map="uploadProgressMap"
          :uploading-ids="uploadingIds"
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
        <PendingSendBar
          :friend-uuid="friendUuid"
          :refresh-signal="pendingRefreshSignal"
          :bottom="footerHeight"
          @visible-change="pendingBarVisible = $event"
        />
        <div :style="{ height: `${footerHeight}px` }">
          <ChatFooter
            :friend-uuid="friendUuid"
            @message-sent="handleMessageSent"
            @upload-start="handleUploadStart"
            @upload-end="handleUploadEnd"
          />
        </div>
      </template>
    </div>
    <MessageActionMenu
      v-if="actionMenu"
      :x="actionMenu.x"
      :y="actionMenu.y"
      :can-copy="actionMenu.msg.text_msg_raw.text_type === 1"
      :can-recall="
        actionMenu.msg.from === MessageFrom.Mine &&
        !isRecallChatMessage(actionMenu.msg)
      "
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
