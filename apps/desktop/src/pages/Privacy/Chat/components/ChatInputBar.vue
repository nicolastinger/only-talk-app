<script setup lang="ts">
/**
 * 聊天输入栏：表情选择 + 文本输入 + 发送
 */
import { EMOJI_LIST } from '../constants';
import { useI18n } from '@/i18n';
import { SendOutlined, SmileOutlined } from '@ant-design/icons-vue';
import type { Ref } from 'vue';
import styles from '../index.module.less';

defineProps<{
  inputText: string;
  showEmojiPicker: boolean;
  emojiPickerRef: Ref<HTMLDivElement | null>;
}>();

const emit = defineEmits<{
  (e: 'input-change', value: string): void;
  (e: 'send'): void;
  (e: 'key-press', event: KeyboardEvent): void;
  (e: 'toggle-emoji-picker'): void;
  (e: 'emoji-click', emoji: string): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div :class="styles.footer">
    <div :class="styles.toolbar">
      <div :ref="emojiPickerRef" :class="styles.emojiWrapper">
        <a-tooltip :title="t('privacyChat.emoji')">
          <a-button
            type="text"
            :class="styles.toolbarBtn"
            @click="emit('toggle-emoji-picker')"
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
        :placeholder="t('privacyChat.inputPlaceholder')"
        :auto-size="{ minRows: 1, maxRows: 3 }"
        @update:value="emit('input-change', $event)"
        @keypress="emit('key-press', $event)"
      />
      <a-button type="primary" :class="styles.sendBtn" @click="emit('send')">
        <template #icon><SendOutlined /></template>
      </a-button>
    </div>
  </div>
</template>
