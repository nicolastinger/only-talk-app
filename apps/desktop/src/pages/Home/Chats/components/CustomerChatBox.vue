<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DEFAULT_ICON, SYSTEM_ACCOUNT } from '@/constants';
import { useBearStore } from '@/stores/app';
import { formatFullTime } from '@/utils/format';
import {
  getChatFileByBizId,
  getFiles,
  shouldAutoDownloadImage,
} from '@workspace/services';
import type {
  ChatMessage,
  FileRecord,
  ImageRecord,
  VoiceRecord,
} from '@workspace/types';
import ChatFile from './ChatFile.vue';
import ChatImage from './ChatImage.vue';
import ChatVoice from './ChatVoice.vue';
import PrivacyModeMessage from './PrivacyModeMessage.vue';
import styles from './styles/CustomerChatBox.module.less';
import TextBox from './TextBox.vue';

const imageCache = new Map<string, string>();

const props = defineProps<{
  textMsgRaw: ChatMessage['text_msg_raw'];
  from?: number;
  ack?: boolean;
  img?: string;
  friendUuid: string;
  senderName?: string;
  currentBizId?: string;
}>();

const store = useBearStore();
const router = useRouter();

// 私聊消息类型
const MSG_TYPE_TEXT = 1;
const MSG_TYPE_IMAGE = 2;
const MSG_TYPE_FILE = 3;
const MSG_TYPE_VOICE = 21;
const MSG_TYPE_PRIVACY = 4;

const raw = computed(() => props.textMsgRaw.raw);
const textType = computed(() => props.textMsgRaw.text_type);
const timestamp = computed(() => props.textMsgRaw.timestamp);
const nanoId = computed(() => props.textMsgRaw.nano_id);

const friendIcon = ref<string>('');
const loading = ref(false);
const imageUrl = ref<string | null>(null);
const imageBizId = ref<string>('');
const autoDownload = ref(true);

// 加载好友头像
watch(
  () => props.img,
  (img) => {
    if (!img) return;

    if (imageCache.has(img)) {
      friendIcon.value = imageCache.get(img)!;
      return;
    }

    loading.value = true;
    getFiles(img)
      .then((FileVos) => {
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';
        if (tauriFilePath) {
          imageCache.set(img, tauriFilePath);
        }
        friendIcon.value = tauriFilePath;
        loading.value = false;
      })
      .catch(() => {
        loading.value = false;
      });
  },
  { immediate: true },
);

// 处理文件/语音消息（私聊：单层 JSON）
const fileRecord = computed<FileRecord | null>(() => {
  if (textType.value !== MSG_TYPE_FILE) return null;
  try {
    return JSON.parse(raw.value) as FileRecord;
  } catch (error) {
    console.error('CustomerChatBox - Error parsing file record:', error);
    return null;
  }
});

const voiceRecord = computed<VoiceRecord | null>(() => {
  if (textType.value !== MSG_TYPE_VOICE) return null;
  try {
    return JSON.parse(raw.value) as VoiceRecord;
  } catch (error) {
    console.error('CustomerChatBox - Error parsing voice record:', error);
    return null;
  }
});

// 处理图片消息（私聊：单层 JSON）
watch(
  [raw, textType, nanoId],
  ([messageRaw, type, id], _, onCleanup) => {
    if (type !== MSG_TYPE_IMAGE) return;

    let bizId = '';
    try {
      const imageRecord: ImageRecord = JSON.parse(messageRaw);
      bizId = imageRecord.biz_id;
    } catch (error) {
      console.error('CustomerChatBox - Error parsing image record:', error);
      return;
    }
    if (!bizId) {
      console.error('CustomerChatBox - No bizId found');
      return;
    }

    imageBizId.value = bizId;
    if (imageCache.has(bizId)) {
      imageUrl.value = imageCache.get(bizId)!;
      return;
    }

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    (async () => {
      // 非计量网络且开关开启才自动下载，否则交给 ChatImage 点击下载
      const allow = await shouldAutoDownloadImage();
      if (cancelled) return;
      autoDownload.value = allow;
      if (!allow) {
        loading.value = false;
        return;
      }
      loading.value = true;
      try {
        const files = await getChatFileByBizId(bizId, id);
        if (cancelled) return;
        const tauriFilePath = files?.[0]?.tauri_file_path;
        if (tauriFilePath) {
          imageCache.set(bizId, tauriFilePath);
          imageUrl.value = tauriFilePath;
        }
      } catch (error) {
        console.error('CustomerChatBox - Error loading image:', error);
      } finally {
        if (!cancelled) loading.value = false;
      }
    })();
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
    <div :class="styles.userIcon">
      <img
        :src="friendIcon || DEFAULT_ICON"
        :width="40"
        :height="40"
        :class="styles.imgItem"
        alt="avatar"
        :style="{ opacity: loading ? 0.7 : 1 }"
        @click="openUserProfile(props.textMsgRaw.send_user || friendUuid)"
        @error="handleImgError"
      />
    </div>
    <div :class="styles.chatContainerWrapper">
      <div v-if="senderName" :class="styles.senderName">{{ senderName }}</div>
      <div
        :class="[
          styles.chatContainer,
          isImageMessage ? styles.imageMessage : '',
          isFileMessage ? styles.fileMessage : '',
          isSpecialMessage ? styles.specialMessage : '',
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
          :auto-download="autoDownload"
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
          />
          <div v-else :class="styles.container">[文件]</div>
        </template>
        <ChatVoice
          v-else-if="textType === MSG_TYPE_VOICE"
          :biz-id="voiceRecord?.biz_id"
          :duration="voiceRecord?.duration || 0"
          :nano-id="nanoId"
        />
        <PrivacyModeMessage
          v-else-if="textType === MSG_TYPE_PRIVACY"
          :is-mine="false"
        />
        <TextBox v-else :raw="raw" />
      </div>
      <div :class="styles.tooltip">{{ formatFullTime(timestamp) }}</div>
    </div>
  </div>
</template>
