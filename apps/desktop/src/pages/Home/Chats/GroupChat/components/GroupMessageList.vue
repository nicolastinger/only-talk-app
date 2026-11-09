<script setup lang="ts">
import { computed } from 'vue';
import { SYSTEM_ACCOUNT } from '@/constants';
import { isRecallMessage } from '@/utils/recall';
import {
  MessageFrom,
  type ChatMessage,
  type UserInfo,
} from '@workspace/types';
import MessageTimestamp from '../../components/MessageTimestamp.vue';
import boxStyles from '../../components/styles/MessageBox.module.less';
import GroupCustomerChatBox from './GroupCustomerChatBox.vue';
import GroupMineChatBox from './GroupMineChatBox.vue';
import { useI18n } from '@/i18n';
import styles from './GroupMessageList.module.less';

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[];
    groupUuid: string;
    newMessageIds?: Set<string>;
    loadedMessageIds?: Set<string>;
    memberInfoMap: Map<string, UserInfo>;
    selectMode?: boolean;
    selectedIds?: Set<string>;
    /** 发送进度：nano_id -> { percent, phase } */
    uploadProgressMap?: Record<string, { percent: number; phase: string }>;
    /** 正在上传的消息 nano_id（上传期间不计入 ACK 超时） */
    uploadingIds?: Set<string>;
  }>(),
  {
    newMessageIds: () => new Set<string>(),
    loadedMessageIds: () => new Set<string>(),
    selectMode: false,
    selectedIds: () => new Set<string>(),
    uploadProgressMap: () => ({}),
    uploadingIds: () => new Set<string>(),
  },
);

const emit = defineEmits<{
  (e: 'message-context', msg: ChatMessage, event: MouseEvent): void;
  (e: 'toggle-select', msg: ChatMessage): void;
}>();

const MSG_TYPE_GROUP_NOTIFICATION = 2004;
const TEN_MINUTES = 10 * 60 * 1000;

const { t } = useI18n();

const getMessageAnimationClass = (nanoId: string): string => {
  if (props.newMessageIds?.has(nanoId)) {
    return styles.newMessageAnimation;
  }
  if (props.loadedMessageIds?.has(nanoId)) {
    return styles.messageItem;
  }
  return '';
};

const rows = computed(() => {
  const result: Array<{
    msg: ChatMessage;
    message: ChatMessage['text_msg_raw'];
    showTimestamp: boolean;
    animationClass: string;
    isMine: boolean;
    isSystem: boolean;
    selected: boolean;
    recall: boolean;
    recallNotice: string;
    systemContent: string;
    senderName: string;
    senderIcon?: string;
    senderUserType?: number;
  }> = [];

  props.messages.forEach((msg, index) => {
    const message = msg.text_msg_raw;
    if (message.text_type === 201) return;

    const prevMsg = index > 0 ? props.messages[index - 1] : null;
    const prevTimestamp = prevMsg?.text_msg_raw.timestamp || 0;
    const currentTimestamp = message.timestamp;
    const shouldShowTimestamp =
      index === 0 ||
      Math.abs(currentTimestamp - prevTimestamp) >= TEN_MINUTES;

    const isMine = msg.from === MessageFrom.Mine;
    const isSystem =
      msg.from === MessageFrom.System ||
      message.send_user === SYSTEM_ACCOUNT ||
      message.text_type === MSG_TYPE_GROUP_NOTIFICATION;

    const memberInfo = props.memberInfoMap.get(
      msg.sender_uuid || message.send_user || '',
    );
    const senderName =
      memberInfo?.username ||
      msg.sender_name ||
      (isMine ? t('groupChat.me') : t('groupChat.groupMember'));
    const senderIcon = memberInfo?.icon || msg.sender_icon || msg.img || '';

    const recall = isRecallMessage(message.text_type, message.raw);
    let systemContent = message.raw;
    if (isSystem || message.text_type === MSG_TYPE_GROUP_NOTIFICATION) {
      try {
        const sysMsg = JSON.parse(message.raw);
        systemContent = sysMsg.text || sysMsg.content || message.raw;
      } catch {
        // 保持原始内容
      }
    }

    result.push({
      msg,
      message,
      showTimestamp: shouldShowTimestamp,
      animationClass: getMessageAnimationClass(message.nano_id),
      isMine,
      isSystem,
      selected: !!props.selectedIds?.has(message.nano_id),
      recall,
      recallNotice: recall
        ? t('chat.recall.notice', {
            name: isMine ? t('chat.recall.you') : senderName,
          })
        : '',
      systemContent,
      senderName,
      senderIcon,
      senderUserType: memberInfo?.user_type,
    });
  });

  return result;
});

const handleContextMenu = (msg: ChatMessage, e: MouseEvent) => {
  emit('message-context', msg, e);
};

const handleRowClick = (msg: ChatMessage, e: MouseEvent) => {
  if (!props.selectMode) return;
  e.stopPropagation();
  e.preventDefault();
  emit('toggle-select', msg);
};
</script>

<template>
  <div :class="styles.groupMessageList">
    <template v-for="row in rows" :key="row.message.nano_id">
      <MessageTimestamp v-if="row.showTimestamp" :timestamp="row.message.timestamp" />
      <div v-if="row.recall" :class="styles.groupMessageSystem">
        {{ row.recallNotice }}
      </div>
      <div v-else-if="row.isSystem" :class="styles.groupMessageSystem">
        {{ row.systemContent }}
      </div>
      <div
        v-else
        :class="[
          row.animationClass,
          boxStyles.rowWrapper,
          selectMode ? boxStyles.selectRow : '',
          row.selected ? boxStyles.selectedRow : '',
        ]"
        @contextmenu.prevent.stop="handleContextMenu(row.msg, $event)"
        @click.capture="handleRowClick(row.msg, $event)"
      >
        <span
          v-if="selectMode"
          :class="[boxStyles.selectMark, row.selected ? boxStyles.checked : '']"
        />
        <GroupMineChatBox
          v-if="row.isMine"
          :msg="row.msg"
          :is-ack="row.msg.ack"
          :icon="row.senderIcon"
          :group-uuid="groupUuid"
          :uploading="uploadingIds?.has(row.message.nano_id) ?? false"
          :upload-progress="uploadProgressMap?.[row.message.nano_id]?.percent"
          :send-phase="uploadProgressMap?.[row.message.nano_id]?.phase"
        />
        <GroupCustomerChatBox
          v-else
          :msg="row.msg"
          :icon="row.senderIcon"
          :sender-name="row.senderName"
          :sender-user-type="row.senderUserType"
          :group-uuid="groupUuid"
        />
      </div>
    </template>
  </div>
</template>
