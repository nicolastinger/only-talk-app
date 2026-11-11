<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  AudioOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SmileOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import {
  getAllFileExtensions,
  getImageExtensions,
  getLocalFileSize,
  selectFile,
} from '@workspace/services';
import {
  MessageFrom,
  UPLOAD_LIMITS,
  type ChatMessage,
  type TextQuicMsgVo,
} from '@workspace/types';
import { nanoid } from 'nanoid';
import type { VoiceRecordingResult } from '@/utils/voiceRecorder';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import VoiceRecordModal from '../../components/VoiceRecordModal.vue';
import styles from './GroupChatFooter.module.less';

const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_VOICE = 2006;

const props = defineProps<{
  groupUuid: string;
}>();

const emit = defineEmits<{
  (e: 'message-sent', message: string): void;
  (e: 'upload-start', nanoId?: string): void;
  (e: 'upload-end', nanoId?: string): void;
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
const msg = ref('');
const showEmojiPicker = ref(false);
const emojiPickerRef = ref<HTMLDivElement>();
const showVoiceRecord = ref(false);

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
  const currentMessage = msg.value;
  if (!currentMessage.trim()) return;

  const text_msg_raw: TextQuicMsgVo = {
    nano_id: nanoid(),
    text_type: MSG_TYPE_GROUP_TEXT,
    raw: currentMessage.trim(),
    recv_user: props.groupUuid,
    send_user: '',
    timestamp: new Date().getTime(),
  };

  const temp: ChatMessage = {
    from: MessageFrom.Mine,
    text_msg_raw,
    ack: false,
  };

  try {
    await invoke('send_group_text_msg', { textQuicMsg: text_msg_raw });
    emit('message-sent', JSON.stringify(temp));
    msg.value = '';
  } catch (e) {
    console.log(t('chat.footer.sendFailed'), e);
    feedback.message.error(t('groupChat.sendFailed'));
  }
};

const handleEmojiClick = (emoji: string) => {
  msg.value = msg.value + emoji;
  showEmojiPicker.value = false;
};

const sendImage = async () => {
  try {
    const filePaths = await selectFile(false, false, [
      { name: 'Images', extensions: await getImageExtensions() },
    ]);

    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
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
        text_type: MSG_TYPE_GROUP_IMAGE,
        raw: filePath,
        recv_user: props.groupUuid,
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
      emit('upload-start', text_msg_raw.nano_id);
      try {
        await invoke('send_group_image_msg', { textQuicMsg: text_msg_raw });
      } finally {
        emit('upload-end', text_msg_raw.nano_id);
      }
    }
  } catch (e) {
    console.log('发送图片失败', e);
    feedback.message.error(t('groupChat.sendImageFailed'));
    emit('upload-end');
  }
};

const sendFile = async () => {
  try {
    const filePaths = await selectFile(false, false, [
      { name: 'Files', extensions: await getAllFileExtensions() },
    ]);

    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
      const size = await getLocalFileSize(filePath);
      if (size > UPLOAD_LIMITS.file) {
        feedback.message.error(
          t('chat.fileTooLarge', {
            limit: Math.floor(UPLOAD_LIMITS.file / (1024 * 1024)),
          }),
        );
        return;
      }
      const text_msg_raw: TextQuicMsgVo = {
        nano_id: nanoid(),
        text_type: MSG_TYPE_GROUP_FILE,
        raw: filePath,
        recv_user: props.groupUuid,
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
      emit('upload-start', text_msg_raw.nano_id);
      try {
        await invoke('send_group_file_msg', { textQuicMsg: text_msg_raw });
      } finally {
        emit('upload-end', text_msg_raw.nano_id);
      }
    }
  } catch (e) {
    console.log('发送文件失败', e);
    feedback.message.error(t('groupChat.sendFileFailed'));
    emit('upload-end');
  }
};

const sendVoice = async (recording: VoiceRecordingResult) => {
  const text_msg_raw: TextQuicMsgVo = {
    nano_id: nanoid(),
    text_type: MSG_TYPE_GROUP_VOICE,
    raw: recording.path,
    recv_user: props.groupUuid,
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
  emit('upload-start', text_msg_raw.nano_id);
  try {
    await invoke('send_group_voice_msg', {
      textQuicMsg: text_msg_raw,
      duration: recording.duration,
    });
  } catch (e) {
    console.log('发送群语音失败', e);
    feedback.message.error(t('chat.voice.failed'));
  } finally {
    emit('upload-end', text_msg_raw.nano_id);
  }
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
      <div :class="styles.footerBtn" :title="t('groupChat.sendImage')" @click="sendImage">
        <PictureOutlined />
      </div>
      <div :class="styles.footerBtn" :title="t('groupChat.sendFile')" @click="sendFile">
        <PaperClipOutlined />
      </div>
      <div
        :class="styles.footerBtn"
        :title="t('chat.voice.sendVoice')"
        @click="showVoiceRecord = true"
      >
        <AudioOutlined />
      </div>
    </div>
    <div :class="styles.footerMessage">
      <a-textarea
        v-model:value="msg"
        :class="styles.footerTextArea"
        :placeholder="t('groupChat.inputPlaceholder')"
        @press-enter="sendMessage"
      />
      <div :class="styles.footerSendBtn">
        <a-button type="primary" variant="outlined" @click="sendMessage">
          {{ t('groupChat.send') }}
        </a-button>
      </div>
    </div>
    <VoiceRecordModal
      :open="showVoiceRecord"
      @cancel="showVoiceRecord = false"
      @send="sendVoice"
    />
  </div>
</template>
