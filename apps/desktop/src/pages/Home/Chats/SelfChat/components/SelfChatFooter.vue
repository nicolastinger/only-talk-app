<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { PictureOutlined, SmileOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import {
  getImageExtensions,
  getLocalFileSize,
  selectFile,
} from '@workspace/services';
import {
  MessageFrom,
  UPLOAD_LIMITS,
  type ChatMessage,
  type TextMsgRaw,
  type TextQuicMsgVo,
} from '@workspace/types';
import { nanoid } from 'nanoid';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './SelfChatFooter.module.less';

const props = defineProps<{
  selfUuid: string;
}>();

const emit = defineEmits<{
  (e: 'message-sent', message: string): void;
}>();

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

const { t } = useI18n();
const messageText = ref('');
const showEmojiPicker = ref(false);
const emojiPickerRef = ref<HTMLDivElement>();

const handleClickOutside = (event: MouseEvent) => {
  if (
    emojiPickerRef.value &&
    !emojiPickerRef.value.contains(event.target as Node)
  ) {
    showEmojiPicker.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});

const sendMessage = async () => {
  const currentMessage = messageText.value;
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
    recv_user: props.selfUuid, // 自己给自己发消息
    send_user: '',
    timestamp: new Date().getTime(),
  };
  try {
    // 自己给自己发的消息走纯本地通道：不经过服务端，避免 self-echo 回推导致同一条消息渲染多次
    const sent = await invoke<TextQuicMsgVo>('send_self_text_msg', {
      textQuicMsg: text_msg_raw,
    });
    const temp: ChatMessage = {
      from: MessageFrom.Mine,
      text_msg_raw: sent,
      ack: true,
    };
    emit('message-sent', JSON.stringify(temp));
    messageText.value = '';
  } catch (e) {
    console.log('发送失败', e);
    feedback.message.error(t('chat.footer.sendFailed'));
  }
};

const sendImage = async () => {
  try {
    const filePaths = await selectFile(false, false, [
      { name: 'Images', extensions: await getImageExtensions() },
    ]);

    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
      console.log('Selected image path:', filePath);

      const size = await getLocalFileSize(filePath);
      if (size > UPLOAD_LIMITS.image) {
        feedback.message.error(
          t('chat.imageTooLarge', {
            limit: Math.floor(UPLOAD_LIMITS.image / (1024 * 1024)),
          }),
        );
        return;
      }

      const text_msg_raw: TextQuicMsgVo = {
        nano_id: nanoid(),
        text_type: 2,
        raw: filePath,
        recv_user: props.selfUuid,
        send_user: '',
        timestamp: new Date().getTime(),
      };

      const temp: ChatMessage = {
        from: MessageFrom.Mine,
        text_msg_raw,
        ack: false,
      };

      // 先上屏(展示气泡与上传进度)，再执行发送
      emit('message-sent', JSON.stringify(temp));
      await invoke('send_image_msg', { textQuicMsg: text_msg_raw });
    }
  } catch (e) {
    console.log('发送图片失败', e);
    feedback.message.error(t('chat.footer.sendImageFailed'));
  }
};

const handleEmojiClick = (emoji: string) => {
  messageText.value = messageText.value + emoji;
  showEmojiPicker.value = false;
};
</script>

<template>
  <div :class="styles.footer">
    <div :class="styles.footerBtnBar">
      <div :class="styles.emojiWrapper" ref="emojiPickerRef">
        <div :class="styles.footerBtn" @click="showEmojiPicker = !showEmojiPicker">
          <SmileOutlined />
        </div>
        <div v-if="showEmojiPicker" :class="styles.emojiPicker">
          <div :class="styles.emojiGrid">
            <span
              v-for="(emoji, index) in EMOJI_LIST"
              :key="index"
              :class="styles.emojiItem"
              @click="handleEmojiClick(emoji)"
            >
              {{ emoji }}
            </span>
          </div>
        </div>
      </div>
      <div :class="styles.footerBtn" :title="t('chat.footer.sendImage')" @click="sendImage">
        <PictureOutlined />
      </div>
    </div>
    <div :class="styles.footerMessage">
      <a-textarea
        v-model:value="messageText"
        :class="styles.footerTextArea"
        :placeholder="t('chat.selfChat.placeholder')"
        @press-enter="sendMessage"
      />
      <div :class="styles.footerSendBtn">
        <a-button type="primary" variant="outlined" @click="sendMessage">
          {{ t('chat.selfChat.send') }}
        </a-button>
      </div>
    </div>
  </div>
</template>
