<script setup lang="ts">
/**
 * 聊天面板：消息列表 + 输入区 + Emoji 选择器
 */
import type { ChatMessageItem, ConnectionState } from '../hooks/useWebRTCCall';
import { useI18n } from '@/i18n';
import {
  ReloadOutlined,
  SendOutlined,
  SmileOutlined,
} from '@ant-design/icons-vue';
import type { Ref } from 'vue';
import styles from '../index.module.less';

const EMOJI_LIST = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '🤣',
  '😂',
  '🙂',
  '🙃',
  '😉',
  '😊',
  '😇',
  '🥰',
  '😍',
  '🤩',
  '😘',
  '😗',
  '😚',
  '😙',
  '🥲',
  '😋',
  '😛',
  '😜',
  '🤪',
  '😝',
  '🤑',
  '🤗',
  '🤭',
  '🤫',
  '🤔',
  '🤐',
  '🤨',
  '😐',
  '😑',
  '😶',
  '😏',
  '😒',
  '🙄',
  '😬',
  '😮‍💨',
  '🤥',
  '😌',
  '😔',
  '😪',
  '🤤',
  '😴',
  '😷',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🤝',
  '🙏',
  '💪',
  '🤘',
  '❤️',
  '💔',
  '💯',
  '🔥',
  '⭐',
  '✨',
  '💥',
  '🎉',
];

defineProps<{
  messages: ChatMessageItem[];
  connectionStatus: ConnectionState;
  /** DataChannel 是否就绪（可发文字） */
  chatReady: boolean;
  isRetrying: boolean;
  inputText: string;
  showEmojiPicker: boolean;
  messageContainerRef: Ref<HTMLDivElement | null>;
  emojiPickerRef: Ref<HTMLDivElement | null>;
}>();

const emit = defineEmits<{
  (e: 'input-change', value: string): void;
  (e: 'key-press', event: KeyboardEvent): void;
  (e: 'send'): void;
  (e: 'toggle-emoji'): void;
  (e: 'emoji-click', emoji: string): void;
  (e: 'retry'): void;
}>();

const { t } = useI18n();

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const displayName = (msg: ChatMessageItem): string =>
  msg.isMine
    ? `${msg.senderName || t('webrtc.me')}(${t('webrtc.me')})`
    : msg.senderName || t('webrtc.peer');
</script>

<template>
  <div :class="styles.chatPanel">
    <div :class="styles.hint">{{ t('webrtc.p2pChatHint') }}</div>
    <div :ref="messageContainerRef" :class="styles.messageContainer">
      <div
        v-if="connectionStatus === 'failed'"
        :class="styles.retryContainer"
      >
        <div :class="styles.retryText">
          {{ t('webrtc.connectionFailed') }}
        </div>
        <a-button
          type="primary"
          :loading="isRetrying"
          @click="emit('retry')"
        >
          <template #icon><ReloadOutlined /></template>
          {{ t('webrtc.retryConnection') }}
        </a-button>
      </div>
      <div
        v-if="connectionStatus === 'connecting'"
        :class="styles.connectingContainer"
      >
        <a-spin />
        <span :class="styles.connectingText">
          {{ t('webrtc.establishingConnection') }}
        </span>
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="styles.messageRow"
      >
        <div :class="styles.messageItem">
          <div :class="styles.messageHeader">
            <span :class="styles.senderName">{{ displayName(msg) }}</span>
            <span :class="styles.messageTime">
              {{ formatTime(msg.timestamp) }}
            </span>
          </div>
          <div
            :class="[
              styles.messageBubble,
              msg.isMine ? styles.mineBubble : styles.friendBubble,
            ]"
          >
            {{ msg.text }}
          </div>
          <span v-if="msg.isMine" :class="styles.messageState">
            {{
              msg.read
                ? t('webrtc.read')
                : msg.delivered
                  ? t('webrtc.delivered')
                  : ''
            }}
          </span>
        </div>
      </div>
    </div>
    <div :class="styles.footer">
      <div :class="styles.toolbar">
        <div :ref="emojiPickerRef" :class="styles.emojiWrapper">
          <a-tooltip :title="t('webrtc.emoji')">
            <a-button
              type="text"
              :class="styles.toolbarBtn"
              @click="emit('toggle-emoji')"
            >
              <template #icon><SmileOutlined /></template>
            </a-button>
          </a-tooltip>
          <div v-if="showEmojiPicker" :class="styles.emojiPicker">
            <div :class="styles.emojiGrid">
              <span
                v-for="(emoji, index) in EMOJI_LIST"
                :key="index"
                :class="styles.emojiItem"
                @click="emit('emoji-click', emoji)"
              >
                {{ emoji }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div :class="styles.inputArea">
        <a-textarea
          :class="styles.textArea"
          :value="inputText"
          :placeholder="
            t(chatReady ? 'webrtc.inputMessage' : 'webrtc.chatConnecting')
          "
          :auto-size="{ minRows: 1, maxRows: 3 }"
          :disabled="connectionStatus !== 'connected' || !chatReady"
          @update:value="emit('input-change', $event)"
          @keypress="emit('key-press', $event)"
        />
        <a-button
          type="primary"
          :class="styles.sendBtn"
          :disabled="connectionStatus !== 'connected' || !chatReady"
          @click="emit('send')"
        >
          <template #icon><SendOutlined /></template>
        </a-button>
      </div>
    </div>
  </div>
</template>
