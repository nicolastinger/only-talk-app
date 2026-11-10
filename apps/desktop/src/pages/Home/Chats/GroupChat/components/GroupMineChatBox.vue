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
  GroupFileRecord,
  GroupVoiceRecord,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import ChatFile from '../../components/ChatFile.vue';
import ChatImage from '../../components/ChatImage.vue';
import ChatVoice from '../../components/ChatVoice.vue';
import TextBox from '../../components/TextBox.vue';
import styles from '../../components/styles/MineChatBox.module.less';

const { t } = useI18n();

const imageCache = new Map<string, string>();

const props = withDefaults(
  defineProps<{
    msg: ChatMessage;
    isAck: boolean | undefined;
    icon?: string;
    groupUuid: string;
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

// 群聊消息类型
const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_VOICE = 2006;

const isLocalFilePath = (raw: string): boolean => {
  // JSON 格式的 raw 不是本地文件路径（群聊消息 raw 始终是 JSON）
  if (raw.startsWith('{') || raw.startsWith('[')) return false;
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

/**
 * 解析群聊消息的 text 字段
 * 文字消息: {"text":"消息内容","send_user":"..."}
 * 图片/文件消息: {"text":"{\"biz_id\":\"...\"}","send_user":"..."}
 */
const parseGroupMessageText = (messageRaw: string): string => {
  try {
    const parsed = JSON.parse(messageRaw);
    return parsed.text || messageRaw;
  } catch {
    return messageRaw;
  }
};

/**
 * 解析群聊图片消息的 bizId
 * 群聊图片消息 raw 是双层 JSON: {"text":"{...GroupImageRecord...}","send_user":"..."}
 */
const parseGroupImageBizId = (messageRaw: string): string | null => {
  try {
    let parsed = JSON.parse(messageRaw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed.biz_id || parsed.url || null;
  } catch (error) {
    console.error('GroupMineChatBox - Error parsing image record:', error);
    return null;
  }
};

/**
 * 解析群聊文件消息
 * 群聊文件消息 raw 是双层 JSON: {"text":"{...GroupFileRecord...}","send_user":"..."}
 */
const parseGroupFileRecord = (messageRaw: string): GroupFileRecord | null => {
  try {
    let parsed = JSON.parse(messageRaw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupFileRecord;
  } catch (error) {
    console.error('GroupMineChatBox - Error parsing file record:', error);
    return null;
  }
};

/**
 * 解析群聊语音消息
 * 群聊语音消息 raw 是双层 JSON: {"text":"{...GroupVoiceRecord...}","send_user":"..."}
 */
const parseGroupVoiceRecord = (messageRaw: string): GroupVoiceRecord | null => {
  try {
    let parsed = JSON.parse(messageRaw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupVoiceRecord;
  } catch (error) {
    console.error('GroupMineChatBox - Error parsing voice record:', error);
    return null;
  }
};

const fileRecord = computed<GroupFileRecord | null>(() => {
  if (textType.value !== MSG_TYPE_GROUP_FILE) return null;
  if (isLocalFilePath(raw.value)) {
    const fileName = raw.value.split(/[/\\]/).pop() || 'unknown';
    return {
      biz_id: '',
      file_name: fileName,
      file_size: 0,
      file_type: fileName.split('.').pop() || '',
      send_user: '',
    };
  }
  return parseGroupFileRecord(raw.value);
});

const voiceRecord = computed<GroupVoiceRecord | null>(() => {
  if (textType.value !== MSG_TYPE_GROUP_VOICE) return null;
  if (isLocalFilePath(raw.value)) return null;
  return parseGroupVoiceRecord(raw.value);
});

// 处理图片/文件/语音消息
watch(
  [raw, textType, () => props.currentBizId, nanoId],
  ([messageRaw, type, currentBizId, id]) => {
    if (type === MSG_TYPE_GROUP_IMAGE) {
      imageUrl.value = null;
      imageBizId.value = '';
      let bizId = currentBizId;

      // 如果没有传入 currentBizId，从 raw 解析
      if (!bizId) {
        // 本地文件路径（发送中的临时消息）
        if (isLocalFilePath(messageRaw)) {
          const tauriUrl = convertPathToTauriUrl(messageRaw);
          if (tauriUrl) {
            imageUrl.value = tauriUrl;
          }
          return;
        }

        bizId = parseGroupImageBizId(messageRaw) || undefined;
      }

      if (!bizId) {
        console.error('GroupMineChatBox - No bizId found');
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
          console.error('GroupMineChatBox - Error loading image:', error);
          loading.value = false;
        });
    }

    if (type === MSG_TYPE_GROUP_VOICE && isLocalFilePath(messageRaw)) {
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

const isImageMessage = computed(() => textType.value === MSG_TYPE_GROUP_IMAGE);
const isFileMessage = computed(() => textType.value === MSG_TYPE_GROUP_FILE);

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
            ackFlag === 101 ? styles.hasSentBubble : '',
          ]"
        >
          <TextBox
            v-if="textType === MSG_TYPE_GROUP_TEXT"
            :raw="parseGroupMessageText(raw)"
          />
          <ChatImage
            v-else-if="textType === MSG_TYPE_GROUP_IMAGE"
            :src="imageUrl"
            :loading="loading"
            :friend-uuid="groupUuid"
            :current-biz-id="imageBizId || currentBizId || ''"
            :biz-id="imageBizId || currentBizId || ''"
            :auto-download="true"
            :sending="sending"
            :upload-progress="uploadProgress"
            :send-phase="sendPhase"
            :me-uuid="store.userInfo?.uuid || ''"
            :is-group="true"
            :nano-id="nanoId"
          />
          <template v-else-if="textType === MSG_TYPE_GROUP_FILE">
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
            v-else-if="textType === MSG_TYPE_GROUP_VOICE"
            :biz-id="voiceRecord?.biz_id"
            :duration="voiceRecord?.duration || 0"
            :local-path="voiceLocalPath"
            :nano-id="nanoId"
            :sending="sending"
            :upload-progress="uploadProgress"
            :send-phase="sendPhase"
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
