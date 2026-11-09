<script setup lang="ts">
/**
 * 消息列表：渲染隐私聊天气泡（含空态）
 */
import type { ChatMessageItem } from '../hooks/usePrivacyChat';
import { useI18n } from '@/i18n';
import type { Ref } from 'vue';
import styles from '../index.module.less';

defineProps<{
  messages: ChatMessageItem[];
  myName: string;
  friendName: string;
  messageContainerRef: Ref<HTMLDivElement | null>;
}>();

const { t } = useI18n();

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const displayName = (
  msg: ChatMessageItem,
  myName: string,
  friendName: string,
): string => {
  const meText = t('privacyChat.me');
  return msg.isMine
    ? `${msg.senderName || myName}(${meText})`
    : msg.senderName || friendName;
};
</script>

<template>
  <div :ref="messageContainerRef" :class="styles.messageContainer">
    <div v-if="messages.length === 0" :class="styles.emptyMessage">
      <span>{{ t('privacyChat.noMessages') }}</span>
    </div>
    <template v-else>
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="styles.messageRow"
      >
        <div :class="styles.messageItem">
          <div :class="styles.messageHeader">
            <span :class="styles.senderName">
              {{ displayName(msg, myName, friendName) }}
            </span>
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
        </div>
      </div>
    </template>
  </div>
</template>
