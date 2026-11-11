<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
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
  GroupFileRecord,
  GroupImageRecord,
  GroupVoiceRecord,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import ChatFile from '../../components/ChatFile.vue';
import ChatImage from '../../components/ChatImage.vue';
import ChatVoice from '../../components/ChatVoice.vue';
import TextBox from '../../components/TextBox.vue';
import styles from '../../components/styles/CustomerChatBox.module.less';

const { t } = useI18n();

const imageCache = new Map<string, string>();

const props = defineProps<{
  msg: ChatMessage;
  icon?: string;
  senderName?: string;
  senderUserType?: number;
  groupUuid: string;
  currentBizId?: string;
}>();

// 群聊消息类型
const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_VOICE = 2006;

const store = useBearStore();
const router = useRouter();

const raw = computed(() => props.msg.text_msg_raw.raw);
const textType = computed(() => props.msg.text_msg_raw.text_type);
const timestamp = computed(() => props.msg.text_msg_raw.timestamp);
const nanoId = computed(() => props.msg.text_msg_raw.nano_id);

const senderIcon = ref<string>('');
const loading = ref(false);
const imageUrl = ref<string | null>(null);
const imageBizId = ref<string>('');
const autoDownload = ref(true);

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
 * 解析群聊图片消息
 * 群聊图片消息 raw 是双层 JSON: {"text":"{...GroupImageRecord...}","send_user":"..."}
 */
const parseGroupImageRecord = (messageRaw: string): GroupImageRecord | null => {
  try {
    let parsed = JSON.parse(messageRaw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupImageRecord;
  } catch (error) {
    console.error('GroupCustomerChatBox - Error parsing image record:', error);
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
    console.error('GroupCustomerChatBox - Error parsing file record:', error);
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
    console.error('GroupCustomerChatBox - Error parsing voice record:', error);
    return null;
  }
};

// 加载发送者头像
watch(
  () => props.icon,
  (icon) => {
    if (!icon) return;

    if (imageCache.has(icon)) {
      senderIcon.value = imageCache.get(icon)!;
      return;
    }

    loading.value = true;
    getFiles(icon)
      .then((FileVos) => {
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';
        if (tauriFilePath) {
          imageCache.set(icon, tauriFilePath);
        }
        senderIcon.value = tauriFilePath;
        loading.value = false;
      })
      .catch(() => {
        loading.value = false;
      });
  },
  { immediate: true },
);

const fileRecord = computed<GroupFileRecord | null>(() =>
  textType.value === MSG_TYPE_GROUP_FILE ? parseGroupFileRecord(raw.value) : null,
);

const voiceRecord = computed<GroupVoiceRecord | null>(() =>
  textType.value === MSG_TYPE_GROUP_VOICE
    ? parseGroupVoiceRecord(raw.value)
    : null,
);

// 处理图片消息
watch(
  [raw, textType, () => props.currentBizId, nanoId],
  ([messageRaw, type, currentBizId, id], _, onCleanup) => {
    if (type !== MSG_TYPE_GROUP_IMAGE) return;

    let bizId = currentBizId;
    // 如果没有传入 currentBizId，从 raw 解析
    if (!bizId) {
      const record = parseGroupImageRecord(messageRaw);
      bizId = record?.biz_id || undefined;
    }
    if (!bizId) {
      console.error('GroupCustomerChatBox - No bizId found');
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
        console.error('GroupCustomerChatBox - Error loading image:', error);
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

const isImageMessage = computed(() => textType.value === MSG_TYPE_GROUP_IMAGE);
const isFileMessage = computed(() => textType.value === MSG_TYPE_GROUP_FILE);

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.userIcon">
      <img
        :src="senderIcon || DEFAULT_ICON"
        :width="40"
        :height="40"
        :class="styles.imgItem"
        alt="avatar"
        :style="{ opacity: loading ? 0.7 : 1 }"
        @click="
          openUserProfile(
            props.msg.sender_uuid || props.msg.text_msg_raw.send_user || '',
          )
        "
        @error="handleImgError"
      />
    </div>
    <div :class="styles.chatContainerWrapper">
      <div v-if="senderName" :class="styles.senderName">
        {{ senderName }}
        <UserTypeTag :type="senderUserType" />
      </div>
      <div
        :class="[
          styles.chatContainer,
          isImageMessage ? styles.imageMessage : '',
          isFileMessage ? styles.fileMessage : '',
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
          :biz-id="imageBizId"
          :auto-download="autoDownload"
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
          />
          <div v-else :class="styles.container">{{ t('chat.typeFile') }}</div>
        </template>
        <ChatVoice
          v-else-if="textType === MSG_TYPE_GROUP_VOICE"
          :biz-id="voiceRecord?.biz_id"
          :duration="voiceRecord?.duration || 0"
          :nano-id="nanoId"
        />
        <TextBox v-else :raw="raw" />
      </div>
      <div :class="styles.tooltip">{{ formatFullTime(timestamp) }}</div>
    </div>
  </div>
</template>
