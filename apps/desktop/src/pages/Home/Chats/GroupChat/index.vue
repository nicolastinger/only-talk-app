<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { SYSTEM_ACCOUNT } from '@/constants';
import { useChatBackground } from '@/hooks/useChatBackground';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useGroupMessageAckApi } from '@/hooks/useGroupMessageAckApi';
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
  type GroupVo,
  type Page,
  type TextQuicMsgVo,
} from '@workspace/types';
import ForwardModal from '../components/ForwardModal.vue';
import GroupTopBar from '../components/GroupTopBar.vue';
import MessageActionMenu from '../components/MessageActionMenu.vue';
import MessageSelectionBar from '../components/MessageSelectionBar.vue';
import GroupChatFooter from './components/GroupChatFooter.vue';
import GroupMessageList from './components/GroupMessageList.vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

type ForwardTarget = {
  recv: string;
  isGroup: boolean;
  name: string;
};

type MessageAction = 'multi' | 'forward' | 'recall' | 'delete' | 'copy';

const PAGE_SIZE = 20;

/** 瞬态消息(通话控制 12-15 / WebRTC 信令 100)：新生命周期下不入聊天历史，仅过滤历史遗留旧数据 */
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
const groupInfo = ref<GroupVo | null>(null);
const footerHeight = ref(180);
const realFootHeight = ref(186);
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

const messageContainerRef = ref<HTMLDivElement>();
const groupId = computed(() => String(route.query.groupId || ''));
const meUuid = computed(() => store.userInfo.uuid || '');

const { textMessage } = useMessageApi(null, () => groupId.value);
// 聊天背景(仅客户端): 有自定义背景时拉伸铺满, 否则保持主题渐变
const chatBackgroundUrl = useChatBackground();
const { groupAckMessage } = useGroupMessageAckApi(groupId.value);

/* 供下方 effect / 回调引用, 提前声明以满足 no-use-before-define */
const scrollToBottom = () => {
  const container = messageContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

const setCurrentGroupSession = async (group: string) => {
  try {
    await invoke('add_user_map', {
      map: { current_session_friend: group },
    });
  } catch (err) {
    console.log(err);
  }
};

const getGroupInfo = async (groupIdValue: string) => {
  try {
    const data: GroupVo = await invoke('get_group_info_command', {
      groupId: groupIdValue,
    });
    groupInfo.value = data;
  } catch (err) {
    console.log('获取群信息失败，从本地加载', err);
    try {
      const localGroups: GroupVo[] = await invoke('get_group_list');
      const found = localGroups.find((g) => g.group_uuid === groupIdValue);
      if (found) groupInfo.value = found;
    } catch (e) {
      console.log(e);
    }
  }
};

const markRead = async (nano_id: string, timestamp: number) => {
  try {
    await invoke('mark_group_read', {
      groupUuid: groupId.value,
      nanoId: nano_id,
      timestamp: timestamp,
    });
    console.log('群消息已读', nano_id);
  } catch (err) {
    console.log(err);
  }
};

const loadChatRecord = async (
  groupIdValue: string,
  page: number,
  isInitial = false,
) => {
  if (isLoading.value) return;

  isLoading.value = true;
  try {
    const pageParam: Page = {
      size: PAGE_SIZE,
      current: page,
      total: 0,
    };
    const data: TextQuicMsgVo[] = await invoke(
      'get_group_chat_record_from_store',
      {
        groupId: groupIdValue,
        page: pageParam,
      },
    );

    if (data.length === 0) {
      hasMore.value = false;
      return;
    }

    const chatMessages: ChatMessage[] = data
      .filter((item) => !isTransientType(item.text_type))
      .map((item) => {
        const from =
          item.send_user === meUuid.value
            ? MessageFrom.Mine
            : MessageFrom.Customer;
        const temp: ChatMessage = {
          from,
          text_msg_raw: item,
          ack: undefined,
          sender_uuid: item.send_user,
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
        const last_read_msg = chatMessages.reduce((latest, current) =>
          latest.text_msg_raw.timestamp > current.text_msg_raw.timestamp
            ? latest
            : current,
        );
        markRead(
          last_read_msg.text_msg_raw.nano_id,
          last_read_msg.text_msg_raw.timestamp,
        );
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
  if (msg.text_msg_raw.text_type !== 2001) return;
  try {
    let text = msg.text_msg_raw.raw;
    try {
      const outer = JSON.parse(text);
      if (outer && outer.text !== undefined) {
        text = String(outer.text);
        const nested = JSON.parse(text);
        if (nested && typeof nested.text === 'string') text = nested.text;
      }
    } catch {
      // 纯文本
    }
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
    await invoke('delete_group_chat_record', { nanoIdList: ids, groupId: groupId.value });
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
    recalled = (await invoke('recall_group_chat_message', {
      groupId: groupId.value,
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
    sender_uuid: meUuid.value,
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
    if (target.isGroup && target.recv === groupId.value) {
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecord(groupId.value, 1, true);
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

// 参与成员信息查询的发送者（保持响应式，供 useGroupMemberInfo 追踪）
const uniqueSenderUuids = reactive<string[]>([]);
watch(
  [messageList, meUuid],
  ([list, me]) => {
    const ids = [
      ...new Set(
        list
          .map((msg) => msg.sender_uuid || msg.text_msg_raw.send_user)
          .filter((uuid) => uuid && uuid !== me && uuid !== SYSTEM_ACCOUNT),
      ),
    ];
    uniqueSenderUuids.splice(0, uniqueSenderUuids.length, ...ids);
  },
  { immediate: true },
);
const { memberInfoMap } = useGroupMemberInfo(uniqueSenderUuids);

watch(footerHeight, (height) => {
  realFootHeight.value = height + 6;
});

watch(messageList, () => {
  if (messageList.value.length > 1) {
    const last_message = messageList.value[messageList.value.length - 1];
    const last_nano_id = last_message.text_msg_raw.nano_id;
    if (last_nano_id !== '' && last_message.ack === undefined) {
      markRead(last_nano_id, last_message.text_msg_raw.timestamp);
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
  // 切换群聊时先清理上一轮监听，避免重复绑定
  unlistenUpload?.();
  unlistenUpload = undefined;

  currentPage.value = 1;
  hasMore.value = true;
  isInitialLoad.value = true;
  messageList.value = [];
  loadChatRecord(groupId.value, 1, true);
  getGroupInfo(groupId.value);
  setCurrentGroupSession(groupId.value);

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

watch(groupId, () => {
  setupChat();
}, { immediate: true });

onUnmounted(() => {
  disposed = true;
  setCurrentGroupSession('');
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
    loadChatRecord(groupId.value, nextPage, false);
  }
};

onMounted(() => {
  window.addEventListener('uploadStart', handleUploadStartEvent);
  window.addEventListener('uploadEnd', handleUploadEndEvent);
  const container = messageContainerRef.value;
  container?.addEventListener('scroll', handleScroll);
});

watch(textMessage, (incoming) => {
  if (!incoming) return;
  // 群内撤回消息：被撤回的原消息已在本地库删除，重拉聊天记录以移除原消息并显示撤回提示
  if (isRecallMessage(incoming.text_type, incoming.raw)) {
    currentPage.value = 1;
    hasMore.value = true;
    isInitialLoad.value = true;
    loadChatRecord(groupId.value, 1, true);
    return;
  }
  let from = MessageFrom.Customer;
  if (incoming.send_user === SYSTEM_ACCOUNT) {
    from = MessageFrom.System;
  }
  if (incoming.send_user === meUuid.value) {
    from = MessageFrom.Mine;
  }
  const temp: ChatMessage = {
    from,
    text_msg_raw: incoming,
    ack: undefined,
    sender_uuid: incoming.send_user,
  };
  if (incoming.text_type === 201) {
    const index = messageList.value.findIndex(
      (item) => item.text_msg_raw.nano_id === incoming.raw,
    );
    if (index === -1) return;
    const ackedMessage = messageList.value[index];
    const ackedMessageType = ackedMessage.text_msg_raw.text_type;
    // 群聊图片消息类型是 2002，文件消息类型是 2003，语音消息类型是 2006
    if (
      ackedMessageType === 2002 ||
      ackedMessageType === 2003 ||
      ackedMessageType === 2006
    ) {
      currentPage.value = 1;
      hasMore.value = true;
      isInitialLoad.value = true;
      loadChatRecord(groupId.value, 1, true);
    }
    // ACK 只是回执，不是一条气泡：原地更新，不追加
    const nextList = [...messageList.value];
    nextList[index] = { ...ackedMessage, ack: true };
    messageList.value = nextList;
  } else {
    // 幂等上屏：同一条消息(重复投递 / 补发)只渲染一次
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

// 处理群消息 ack 回执
watch(groupAckMessage, (ack) => {
  if (!ack) return;
  // raw 字段携带的是原消息的 nano_id
  const index = messageList.value.findIndex(
    (item) => item.text_msg_raw.nano_id === ack.raw,
  );
  if (index === -1) return;
  const ackedMessage = messageList.value[index];
  const nextList = [...messageList.value];
  nextList[index] = {
    ...ackedMessage,
    ack: true,
    // 用服务端返回的 nano_id 归一本地乐观消息的 nano_id，
    // 否则后续撤回/删除会因本地 id 在 group_chat_record 中不存在而失败
    text_msg_raw: {
      ...ackedMessage.text_msg_raw,
      nano_id: ack.nano_id || ackedMessage.text_msg_raw.nano_id,
    },
  };
  messageList.value = nextList;
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

const handleMessageSent = (messageStr: string) => {
  const temp: ChatMessage = JSON.parse(messageStr);
  const nanoId = temp.text_msg_raw.nano_id;
  newMessageIds.value = new Set([nanoId]);
  // 幂等上屏：同一 nano_id 只追加一次
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

const handleActionMenuClose = () => {
  actionMenu.value = null;
};
</script>

<template>
  <div :class="styles.container" :style="chatBackgroundStyle">
    <div :class="styles.header">
      <GroupTopBar
        :title="groupInfo?.group_name || ''"
        :group-id="groupId"
        :member-count="groupInfo?.member_count || 0"
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
            : `calc(100% - ${realFootHeight}px)`,
        }"
      >
        <div v-if="isLoading && !isInitialLoad" :class="styles.loadingIndicator">
          <div :class="styles.loadingSpinner"></div>
          <span>{{ t('groupChat.loading') }}</span>
        </div>
        <div v-if="!hasMore && messageList.length > 0" :class="styles.noMoreIndicator">
          {{ t('groupChat.noMoreMessages') }}
        </div>
        <GroupMessageList
          :messages="messageList"
          :group-uuid="groupId"
          :new-message-ids="newMessageIds"
          :loaded-message-ids="loadedMessageIds"
          :member-info-map="memberInfoMap"
          :select-mode="selectMode"
          :selected-ids="selectedIds"
          :upload-progress-map="uploadProgressMap"
          :uploading-ids="uploadingIds"
          @message-context="handleMessageContext"
          @toggle-select="handleToggleSelect"
        />
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
      <div v-else :style="{ height: `${footerHeight}px` }">
        <GroupChatFooter
          :group-uuid="groupId"
          @message-sent="handleMessageSent"
          @upload-start="handleUploadStart"
          @upload-end="handleUploadEnd"
        />
      </div>
    </div>
    <MessageActionMenu
      v-if="actionMenu"
      :x="actionMenu.x"
      :y="actionMenu.y"
      :can-copy="actionMenu.msg.text_msg_raw.text_type === 2001"
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
