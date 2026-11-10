<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { formatMessageTime } from '@/utils/format';
import { isRecallMessage } from '@/utils/recall';
import { getFiles } from '@workspace/services';
import type { MessageQueueProps } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from './styles/MessageBox.module.less';

const { t } = useI18n();

const props = defineProps<
  MessageQueueProps & {
    isSelected?: boolean;
    userType?: number;
    isGroup?: boolean;
  }
>();

// 图片缓存
const imageCache = new Map<string, string>();

// 判断是否是自己给自己的会话
const isSelfChat = computed(
  () => !!props.send_user && !!props.recv_user && props.send_user === props.recv_user,
);

const friendIcon = ref<string>('');
const loading = ref(false);

const displayMessage = computed(() => {
  if (isRecallMessage(props.text_type ?? -1, props.message)) {
    return t('chat.recalled');
  }

  if (props.text_type === 2 || props.text_type === 2002) {
    return t('chat.typeImage');
  }

  if (props.text_type === 3 || props.text_type === 2003) {
    return t('chat.typeFile');
  }

  if (props.text_type === 21 || props.text_type === 2006) {
    return t('chat.typeVoice');
  }

  if (props.text_type === 2004) {
    return t('chat.typeGroupNotice');
  }

  try {
    console.log('MessageBox message:', props.message);
    const parsed = JSON.parse(props.message);
    if (parsed.text) {
      return parsed.text;
    }
  } catch (e) {
    console.error('Failed to parse message:', e);
  }

  return props.message;
});

// 获取用户头像
const getUserIcon = async (icon: string): Promise<string> => {
  try {
    // 再次检查缓存（防止并发请求）
    if (imageCache.has(icon)) {
      return imageCache.get(icon)!;
    }

    const FileVos = await getFiles(icon);
    const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';

    // 存入缓存
    imageCache.set(icon, tauriFilePath);

    return tauriFilePath;
  } catch (error) {
    console.log(error);
    return '';
  }
};

// 只在 img 真正变化时重新获取头像
watch(
  () => props.img,
  (img) => {
    if (!img) return;

    // 检查缓存
    if (imageCache.has(img)) {
      friendIcon.value = imageCache.get(img)!;
      return;
    }

    loading.value = true;
    getUserIcon(img)
      .then((icon) => {
        friendIcon.value = icon;
        loading.value = false;
      })
      .catch(() => {
        loading.value = false;
      });
  },
  { immediate: true },
);

const timeStr = computed(() => formatMessageTime(props.time));

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="[styles.container, isSelected ? styles.selected : '']">
    <div :class="styles.left">
      <a-badge :count="count">
        <img
          :src="friendIcon || DEFAULT_ICON"
          :class="styles.imgItem"
          alt="avatar"
          :style="{ opacity: loading ? 0.7 : 1 }"
          @error="handleImgError"
        />
      </a-badge>
    </div>
    <div :class="styles.center">
      <div :class="styles.centerTitle">
        <div :class="styles.titleText">
          <div :class="styles.title">
            {{ title }}
            <UserTypeTag :type="userType" />
            <span v-if="isGroup" :class="styles.groupBadge">
              {{ t('chat.groupBadge') }}
            </span>
            <span v-if="isSelfChat" :class="styles.selfChatBadge">
              📝 {{ t('chat.selfChat.notes') }}
            </span>
          </div>
          <div :class="styles.end">
            <div :class="styles.endTime">{{ timeStr }}</div>
          </div>
        </div>
      </div>
      <div :class="styles.centerText">
        <div :class="styles.msgText">{{ displayMessage }}</div>
      </div>
    </div>
  </div>
</template>
