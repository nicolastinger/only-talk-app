<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DEFAULT_ICON, SYSTEM_ACCOUNT } from '@/constants';
import { useBearStore } from '@/stores/app';
import { formatFullTime } from '@/utils/format';
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  getFiles,
} from '@workspace/services';
import type {
  ChatMessage,
  FileRecord,
  ImageRecord,
  VoiceRecord,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import ChatFile from './ChatFile.vue';
import ChatImage from './ChatImage.vue';
import ChatVoice from './ChatVoice.vue';
import PrivacyModeMessage from './PrivacyModeMessage.vue';
import styles from './styles/MineChatBox.module.less';
import TextBox from './TextBox.vue';

const { t } = useI18n();

const imageCache = new Map<string, string>();

const props = withDefaults(
  defineProps<{
    msg: ChatMessage;
    isAck: boolean | undefined;
    icon?: string;
    friendUuid: string;
    currentBizId?: string;
    /** 该消息是否正在上传（上传期间不启动 ACK 超时） */
    uploading?: boolean;
    /** 上传进度百分比 0-100（发送中展示） */
    uploadProgress?: number;
    /** 发送阶段：reading/compressing/uploading */
    sendPhase?: string;
  }>(),
  {
    isAck: true,
    uploading: false,
  },
);

// 私聊消息类型
const MSG_TYPE_TEXT = 1;
const MSG_TYPE_IMAGE = 2;
const MSG_TYPE_FILE = 3;
const MSG_TYPE_VOICE = 21;
const MSG_TYPE_PRIVACY = 4;

const isLocalFilePath = (raw: string): boolean => {
  return (
    raw.includes(':\\') || raw.startsWith('/') || raw.startsWith('file://')
  );
};

const store = useBearStore();
const router = useRouter();

const raw = computed(() => props.msg.text_msg_raw.raw);
const textType = computed(() => props.msg.text_msg_raw.text_type);
const timestamp = computed(() => props.msg.text_msg_raw.timestamp);
const nanoId = computed(() => props.msg.text_msg_raw.nano_id);
const sending = computed(() => props.isAck === false);

const userIcon = ref<string | null>(null);
const loading = ref(false);
const imageUrl = ref<string | null>(null);
const imageBizId = ref<string>('');
const voiceLocalPath = ref<string>('');
const ackFlag = ref(0);
let timer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

watch(
  [() => props.isAck, () => props.uploading],
  ([isAck, uploading]) => {
    clearTimer();

    // 文件/图片上传期间不计入 ACK 超时：上传完成后(不再 uploading)才开始计时，
    // 避免大文件上传耗时被误判为发送失败。
    if (isAck !== undefined && !isAck && !uploading) {
      timer = setTimeout(() => {
        ackFlag.value = 1;
      }, 10000);
    } else if (isAck !== undefined && isAck) {
      ackFlag.value = 101;
    }
  },
  { immediate: true },
);

onUnmounted(clearTimer);

const getUserIcon = async (iconBizId: string) => {
  try {
    if (imageCache.has(iconBizId)) {
      userIcon.value = imageCache.get(iconBizId)!;
      return;
    }

    loading.value = true;
    const FileVos = await getFiles(iconBizId);
    const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

    if (tauriFilePath) {
      imageCache.set(iconBizId, tauriFilePath);
    }

    userIcon.value = tauriFilePath;
    loading.value = false;
  } catch (error) {
    console.log(error);
    loading.value = false;
  }
};

watch(
  () => store.userInfo?.icon,
  (icon) => {
    if (icon) {
      getUserIcon(icon);
    }
  },
  { immediate: true },
);

const fileRecord = computed<FileRecord | null>(() => {
  if (textType.value !== MSG_TYPE_FILE) return null;
  if (isLocalFilePath(raw.value)) {
    const fileName = raw.value.split(/[/\\]/).pop() || 'unknown';
    return {
      prev_id: '',
      biz_id: '',
      file_name: fileName,
      file_size: 0,
      file_type: fileName.split('.').pop() || '',
      platform: 0,
    };
  }

  try {
    return JSON.parse(raw.value) as FileRecord;
  } catch (error) {
    console.error('MineChatBox - Error parsing file record:', error);
    return null;
  }
});

const voiceRecord = computed<VoiceRecord | null>(() => {
  if (textType.value !== MSG_TYPE_VOICE) return null;
  if (isLocalFilePath(raw.value)) return null;
  try {
    return JSON.parse(raw.value) as VoiceRecord;
  } catch (error) {
    console.error('MineChatBox - Error parsing voice record:', error);
    return null;
  }
});

// 处理图片/文件/语音消息（私聊：单层 JSON，发送中为本地路径）
watch(
  [raw, textType, nanoId],
  ([messageRaw, type, id]) => {
    if (type === MSG_TYPE_IMAGE) {
      imageUrl.value = null;
      imageBizId.value = '';
      if (isLocalFilePath(messageRaw)) {
        const tauriUrl = convertPathToTauriUrl(messageRaw);
        if (tauriUrl) {
          imageUrl.value = tauriUrl;
        }
        return;
      }

      try {
        const imageRecord: ImageRecord = JSON.parse(messageRaw);
        const bizId = imageRecord.biz_id;

        if (!bizId) {
          console.error('MineChatBox - No bizId found');
          return;
        }

        imageBizId.value = bizId;

        if (imageCache.has(bizId)) {
          imageUrl.value = imageCache.get(bizId)!;
          return;
        }

        loading.value = true;
        getChatFileByBizId(bizId, id)
          .then((files) => {
            if (files && files.length > 0) {
              const tauriFilePath = files[0].tauri_file_path;
              if (tauriFilePath) {
                imageCache.set(bizId, tauriFilePath);
                imageUrl.value = tauriFilePath;
              }
            }
            loading.value = false;
          })
          .catch((error) => {
            console.error('MineChatBox - Error loading image:', error);
            loading.value = false;
          });
      } catch (error) {
        console.error('MineChatBox - Error parsing image record:', error);
      }
    }

    if (type === MSG_TYPE_VOICE && isLocalFilePath(messageRaw)) {
      voiceLocalPath.value = messageRaw;
    }
  },
  { immediate: true },
);

const openUserProfile = (uuid: string) => {
  if (!uuid || uuid === SYSTEM_ACCOUNT) return;

  if (store.userInfo?.uuid && uuid === store.userInfo.uuid) {
    store.openUserInfoModal();
    return;
  }

  router.push('/home/contacts/friend?friendId=' + uuid);
};

const isImageMessage = computed(() => textType.value === MSG_TYPE_IMAGE);
const isFileMessage = computed(() => textType.value === MSG_TYPE_FILE);
const isSpecialMessage = computed(() =>
  [MSG_TYPE_PRIVACY].includes(textType.value),
);

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.messageWrapper">
      <div v-if="ackFlag === 1" :class="styles.ackStatus">
        <div :class="styles.ackError">
          <span :class="styles.ackIcon">!</span>
          <span>{{ t('chat.statusFailed') }}</span>
        </div>
      </div>
      <div
        :class="[styles.chatContainerWrapper, ackFlag === 101 ? styles.hasSent : '']"
      >
        <div
          :class="[
            styles.chatContainer,
            isImageMessage ? styles.imageMessage : '',
            isFileMessage ? styles.fileMessage : '',
            isSpecialMessage ? styles.specialMessage : '',
            ackFlag === 101 ? styles.hasSentBubble : '',
          ]"
        >
          <TextBox v-if="textType === MSG_TYPE_TEXT" :raw="raw" />
          <ChatImage
            v-else-if="textType === MSG_TYPE_IMAGE"
            :src="imageUrl"
            :loading="loading"
            :friend-uuid="friendUuid"
            :current-biz-id="imageBizId"
            :biz-id="imageBizId"
            :auto-download="true"
            :sending="sending"
            :upload-progress="uploadProgress"
            :send-phase="sendPhase"
            :me-uuid="store.userInfo?.uuid || ''"
            :nano-id="nanoId"
          />
          <template v-else-if="textType === MSG_TYPE_FILE">
            <ChatFile
              v-if="fileRecord"
              :biz-id="fileRecord.biz_id"
              :file-name="fileRecord.file_name"
              :file-size="fileRecord.file_size"
              :file-type="fileRecord.file_type"
              :nano-id="nanoId"
              :loading="loading"
              :sending="sending"
              :upload-progress="uploadProgress"
              :send-phase="sendPhase"
            />
            <div v-else :class="styles.container">{{ t('chat.typeFile') }}</div>
          </template>
          <ChatVoice
            v-else-if="textType === MSG_TYPE_VOICE"
            :biz-id="voiceRecord?.biz_id"
            :duration="voiceRecord?.duration || 0"
            :local-path="voiceLocalPath"
            :nano-id="nanoId"
            :sending="sending"
            :upload-progress="uploadProgress"
            :send-phase="sendPhase"
          />
          <PrivacyModeMessage
            v-else-if="textType === MSG_TYPE_PRIVACY"
            :is-mine="true"
          />
          <TextBox v-else :raw="raw" />
          <span v-if="ackFlag === 101" :class="styles.sentBadge" />
        </div>
        <span v-if="ackFlag === 101" :class="styles.sentLabel">
          {{ t('chat.statusSent') }}
        </span>
        <div :class="styles.tooltip">{{ formatFullTime(timestamp) }}</div>
      </div>
    </div>
    <div :class="styles.userIcon">
      <img
        :src="userIcon || DEFAULT_ICON"
        :width="40"
        :height="40"
        :class="styles.imgItem"
        alt="icon"
        :style="{ opacity: loading ? 0.7 : 1 }"
        @click="openUserProfile(store.userInfo?.uuid || '')"
        @error="handleImgError"
      />
    </div>
  </div>
</template>
