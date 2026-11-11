<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { MessageFrom, type ChatMessage, type TextMsgRaw, type TextQuicMsgVo } from '@workspace/types';
import { nanoid } from 'nanoid';
import FooterToolBar from './FooterToolBar.vue';
import { useI18n } from '@/i18n';
import styles from './styles/Footer.module.less';

const props = defineProps<{
  friendUuid: string;
}>();

const emit = defineEmits<{
  (e: 'message-sent', message: string): void;
  (e: 'upload-start', nanoId?: string): void;
  (e: 'upload-end', nanoId?: string): void;
}>();

const { t } = useI18n();
const message = ref('');

const sendMessage = async () => {
  const currentMessage = message.value;
  if (!currentMessage.trim()) return;

  const raw: TextMsgRaw = {
    text: currentMessage,
    prev_id: '',
    platform: 0,
  };

  const text_msg_raw: TextQuicMsgVo = {
    nano_id: nanoid(),
    text_type: 1,
    raw: JSON.stringify(raw),
    recv_user: props.friendUuid,
    send_user: '',
    timestamp: new Date().getTime(),
  };
  const temp: ChatMessage = {
    from: MessageFrom.Mine,
    text_msg_raw,
    ack: false,
  };
  try {
    await invoke('send_text_msg', { textQuicMsg: text_msg_raw });
    emit('message-sent', JSON.stringify(temp));
    message.value = '';
  } catch (e) {
    console.log(t('chat.footer.sendFailed'), e);
  }
};

const handleEmojiSelect = (emoji: string) => {
  message.value = message.value + emoji;
};
</script>

<template>
  <div :class="styles.footer">
    <FooterToolBar
      :friend-uuid="friendUuid"
      @emoji-select="handleEmojiSelect"
      @message-sent="(value) => emit('message-sent', value)"
      @upload-start="(nanoId) => emit('upload-start', nanoId)"
      @upload-end="(nanoId) => emit('upload-end', nanoId)"
    />
    <div :class="styles.footerMessage">
      <a-textarea
        v-model:value="message"
        :class="styles.footerTextArea"
        :placeholder="t('chat.inputPlaceholder')"
        @press-enter="sendMessage"
      />
      <div :class="styles.footerSendBtn">
        <a-button type="primary" variant="outlined" @click="sendMessage">
          {{ t('chat.send') }}(S)
        </a-button>
      </div>
    </div>
  </div>
</template>
