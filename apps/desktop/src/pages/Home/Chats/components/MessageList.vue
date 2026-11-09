<script setup lang="ts">
import { computed } from 'vue';
import { isRecallMessage } from '@/utils/recall';
import { useI18n } from '@/i18n';
import { MessageFrom, type ChatMessage } from '@workspace/types';
import CustomerChatBox from './CustomerChatBox.vue';
import MessageTimestamp from './MessageTimestamp.vue';
import MineChatBox from './MineChatBox.vue';
import styles from './styles/MessageBox.module.less';

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[];
    friendIcon?: string;
    friendUuid: string;
    friendName?: string;
    groupMode?: boolean;
    newMessageIds?: Set<string>;
    loadedMessageIds?: Set<string>;
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

const { t } = useI18n();
const TEN_MINUTES = 10 * 60 * 1000;

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
    selected: boolean;
    recall: boolean;
    recallNotice: string;
    displayIcon?: string;
    senderName?: string;
    currentBizId: string;
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

    let currentBizId = '';
    if (message.text_type === 2) {
      try {
        const imageRecord = JSON.parse(message.raw);
        currentBizId = imageRecord.biz_id;
      } catch (error) {
        console.error('Failed to parse image record:', error);
      }
    }

    const isMine = msg.from === MessageFrom.Mine;
    const recall = isRecallMessage(message.text_type, message.raw);
    const displayIcon = props.groupMode
      ? msg.sender_icon || msg.img || props.friendIcon
      : props.friendIcon;

    result.push({
      msg,
      message,
      showTimestamp: shouldShowTimestamp,
      animationClass: getMessageAnimationClass(message.nano_id),
      isMine,
      selected: !!props.selectedIds?.has(message.nano_id),
      recall,
      recallNotice: recall
        ? t('chat.recall.notice', {
            name: isMine
              ? t('chat.recall.you')
              : props.friendName || t('chat.recall.peer'),
          })
        : '',
      displayIcon,
      senderName: props.groupMode ? msg.sender_name : undefined,
      currentBizId,
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
  <template v-for="row in rows" :key="row.message.nano_id">
    <MessageTimestamp v-if="row.showTimestamp" :timestamp="row.message.timestamp" />
    <div v-if="row.recall" :class="styles.recallNotice">
      {{ row.recallNotice }}
    </div>
    <div
      v-else
      :class="[
        row.animationClass,
        styles.rowWrapper,
        selectMode ? styles.selectRow : '',
        row.selected ? styles.selectedRow : '',
      ]"
      @contextmenu.prevent.stop="handleContextMenu(row.msg, $event)"
      @click.capture="handleRowClick(row.msg, $event)"
    >
      <span
        v-if="selectMode"
        :class="[styles.selectMark, row.selected ? styles.checked : '']"
      />
      <template v-if="!row.isMine">
        <CustomerChatBox
          :from="MessageFrom.System"
          :ack="undefined"
          :img="row.displayIcon"
          :sender-name="row.senderName"
          :text-msg-raw="row.message"
          :friend-uuid="friendUuid"
          :current-biz-id="row.currentBizId"
        />
      </template>
      <template v-else>
        <MineChatBox
          :icon="row.displayIcon"
          :msg="row.msg"
          :is-ack="row.msg.ack"
          :friend-uuid="friendUuid"
          :current-biz-id="row.currentBizId"
          :uploading="uploadingIds?.has(row.message.nano_id) ?? false"
          :upload-progress="uploadProgressMap?.[row.message.nano_id]?.percent"
          :send-phase="uploadProgressMap?.[row.message.nano_id]?.phase"
        />
      </template>
    </div>
  </template>
</template>
