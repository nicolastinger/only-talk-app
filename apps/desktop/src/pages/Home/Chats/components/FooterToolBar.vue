<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { openWebRTCChatHandler } from '@/hooks/useWebRTCSignalApi';
import { useBearStore } from '@/stores/app';
import {
  AudioOutlined,
  ApiOutlined,
  LockOutlined,
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
import VoiceRecordModal from './VoiceRecordModal.vue';
import styles from './styles/FooterToolBar.module.less';

const props = defineProps<{
  friendUuid: string;
}>();

const emit = defineEmits<{
  (e: 'emoji-select', emoji: string): void;
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
const store = useBearStore();
const showEmojiPicker = ref(false);
const showVoiceRecord = ref(false);
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
        recv_user: props.friendUuid,
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
        await invoke('send_image_msg', { textQuicMsg: text_msg_raw });
      } finally {
        emit('upload-end', text_msg_raw.nano_id);
      }
    }
  } catch (e) {
    console.log('发送图片失败', e);
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
      console.log('Selected file path:', filePath);

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
        text_type: 3,
        raw: filePath,
        recv_user: props.friendUuid,
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
        await invoke('send_file_msg', { textQuicMsg: text_msg_raw });
      } finally {
        emit('upload-end', text_msg_raw.nano_id);
      }
    }
  } catch (e) {
    console.log('发送文件失败', e);
    emit('upload-end');
  }
};

const sendVoice = async (recording: VoiceRecordingResult) => {
  const text_msg_raw: TextQuicMsgVo = {
    nano_id: nanoid(),
    text_type: 21,
    raw: recording.path,
    recv_user: props.friendUuid,
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
    await invoke('send_voice_msg', {
      textQuicMsg: text_msg_raw,
      duration: recording.duration,
    });
  } catch (e) {
    console.log('发送语音失败', e);
    feedback.message.error(t('chat.voice.failed'));
  } finally {
    emit('upload-end', text_msg_raw.nano_id);
  }
};

const sendRequestToP2p = async () => {
  try {
    const res: string = await invoke('send_init_p2p_udp');
    console.log('发送结果', res);
    const quicRes: string = await invoke('send_p2p_init_msg', {
      acceptUser: props.friendUuid,
    });
    console.log('quic结果', quicRes);
  } catch (e) {
    console.log('发送失败', e);
  }
};

const startWebRTCChat = async () => {
  try {
    const localUserId = store.userInfo.uuid;
    if (!localUserId) {
      feedback.message.error(t('chat.footer.userInfoError'));
      return;
    }

    // 完全解耦：点击即打开发起方 WebRTC 窗口，邀请/接受/拒绝都在窗口内处理
    const sessionId = nanoid();
    await openWebRTCChatHandler(
      props.friendUuid,
      localUserId,
      true,
      undefined,
      sessionId,
    );
    console.log(
      `[WebRTC] 已打开发起方 WebRTC 窗口 - friendId: ${props.friendUuid}, sessionId: ${sessionId}`,
    );
  } catch (e) {
    console.error('发起 WebRTC 失败:', e);
    feedback.message.error(t('chat.footer.webRTCFailed'));
  }
};

const handleEmojiClick = (emoji: string) => {
  console.log('Selected emoji:', emoji);
  emit('emoji-select', emoji);
  showEmojiPicker.value = false;
};
</script>

<template>
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
    <div :class="styles.footerBtn" :title="t('chat.footer.sendFile')" @click="sendFile">
      <PaperClipOutlined />
    </div>
    <div
      :class="styles.footerBtn"
      :title="t('chat.voice.sendVoice')"
      @click="showVoiceRecord = true"
    >
      <AudioOutlined />
    </div>
    <div
      :class="styles.footerBtn"
      :title="t('chat.footer.privateChat')"
      @click="sendRequestToP2p"
    >
      <LockOutlined />
    </div>
    <div
      :class="styles.footerBtn"
      :title="t('chat.footer.startWebRTC')"
      @click="startWebRTCChat"
    >
      <ApiOutlined />
    </div>
    <VoiceRecordModal
      :open="showVoiceRecord"
      @cancel="showVoiceRecord = false"
      @send="sendVoice"
    />
  </div>
</template>
