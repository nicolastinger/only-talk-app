<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StyleValue } from 'vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import AppImage from '@/components/AppImage/index.vue';
import type { ChatFileDownloadProgress } from '@workspace/services';
import {
  getChatFileByBizId,
  getFriendImageMessages,
  getGroupImageMessages,
  hasLocalChatFile,
  openImagePreviewWindow,
} from '@workspace/services';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/ChatImage.module.less';

const props = withDefaults(
  defineProps<{
    src: string | null;
    loading: boolean;
    alt?: string;
    maxWidth?: string;
    maxHeight?: string;
    borderRadius?: string;
    className?: string;
    style?: StyleValue;
    friendUuid: string;
    currentBizId: string;
    meUuid: string;
    isGroup?: boolean;
    nanoId?: string;
    /** 图片业务 ID（用于点击下载） */
    bizId?: string;
    /** 是否允许自动下载（关闭或非计量网络外时为 false → 展示点击下载） */
    autoDownload?: boolean;
    /** 是否正在上传（发送中展示进度遮罩） */
    sending?: boolean;
    /** 上传进度百分比 0-100 */
    uploadProgress?: number;
    /** 发送阶段：reading/compressing/uploading */
    sendPhase?: string;
  }>(),
  {
    alt: undefined,
    maxWidth: '300px',
    maxHeight: '300px',
    borderRadius: '5px',
    isGroup: false,
    autoDownload: true,
    sending: false,
    uploadProgress: 0,
  },
);

const { t } = useI18n();
const isOpening = ref(false);
const downloading = ref(false);
const localSrc = ref<string | null>(null);
const checkingLocal = ref(false);
const progress = ref<{
  downloaded: number;
  total: number;
}>({ downloaded: 0, total: 0 });

const resolvedBizId = computed(() => props.bizId || props.currentBizId);
const resolvedSrc = computed(() => props.src || localSrc.value);
const percent = computed(() =>
  progress.value.total > 0
    ? Math.min(
        100,
        Math.floor((progress.value.downloaded / progress.value.total) * 100),
      )
    : 0,
);
const uploadPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.uploadProgress))),
);
const uploadIndeterminate = computed(
  () => props.sending && props.sendPhase !== 'uploading',
);
// 禁止自动下载但本地已有文件时直接展示；仅「本地无文件」才展示点击下载
const needsDownload = computed(
  () =>
    !resolvedSrc.value &&
    !props.loading &&
    !props.autoDownload &&
    !checkingLocal.value &&
    !!resolvedBizId.value,
);

// 挂载/切换消息时先查本地是否已下载：已存在则直接加载，避免重复出现下载按钮
watch(
  [resolvedBizId, resolvedSrc, () => props.nanoId],
  ([bizId, src, nanoId]) => {
    if (src || !bizId) return;

    let cancelled = false;
    checkingLocal.value = true;
    (async () => {
      try {
        const local = await hasLocalChatFile(bizId);
        if (cancelled || !local) return;
        // 本地已有记录：get_chat_file_by_biz_id 直接返回本地路径，不会重复下载
        const files = await getChatFileByBizId(bizId, nanoId);
        if (cancelled) return;
        const tauriFilePath = files?.[0]?.tauri_file_path;
        if (tauriFilePath) localSrc.value = tauriFilePath;
      } catch (error) {
        console.error('ChatImage 本地文件检查失败:', error);
      } finally {
        if (!cancelled) checkingLocal.value = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  },
  { immediate: true },
);

const onProgress = (p: ChatFileDownloadProgress) => {
  progress.value = { downloaded: p.downloaded, total: p.total };
};

// 点击已加载图片 → 打开预览窗口
const handlePreview = async () => {
  if (!resolvedSrc.value || isOpening.value) return;

  isOpening.value = true;
  try {
    let imageUrls: string[] = [];
    let currentIndex = 0;

    if (props.isGroup) {
      const result = await getGroupImageMessages(
        props.friendUuid,
        resolvedBizId.value,
        props.nanoId,
      );
      imageUrls = result.imageUrls;
      currentIndex = result.currentIndex;
    } else {
      const result = await getFriendImageMessages(
        props.meUuid,
        props.friendUuid,
        resolvedBizId.value,
      );
      imageUrls = result.imageUrls;
      currentIndex = result.currentIndex;
    }

    if (imageUrls.length > 0) {
      openImagePreviewWindow(imageUrls, currentIndex);
    }
  } catch (error) {
    console.error('Failed to open image preview:', error);
  } finally {
    isOpening.value = false;
  }
};

// 点击下载：展示进度条，完成后直接显示图片
const handleDownload = async () => {
  if (downloading.value || !resolvedBizId.value) return;

  downloading.value = true;
  progress.value = { downloaded: 0, total: 0 };
  try {
    const files = await getChatFileByBizId(
      resolvedBizId.value,
      props.nanoId,
      onProgress,
    );
    const tauriFilePath = files?.[0]?.tauri_file_path;
    if (tauriFilePath) {
      localSrc.value = tauriFilePath;
    } else {
      feedback.message.error(t('chat.imageDownloadFailed'));
    }
  } catch (error) {
    console.error('图片下载失败:', error);
    feedback.message.error(t('chat.imageDownloadFailed'));
  } finally {
    downloading.value = false;
  }
};

const handlePreviewClick = () => {
  if (!props.sending) handlePreview();
};
</script>

<template>
  <div
    v-if="downloading"
    :class="[styles.placeholder, className]"
    :style="{
      maxWidth,
      maxHeight,
      borderRadius,
      ...(typeof style === 'object' && style ? style : {}),
    }"
  >
    <a-progress :percent="percent" size="small" status="active" />
    <span :class="styles.downloadText">
      {{ t('chat.downloadingPercent', { percent }) }}
    </span>
  </div>
  <div
    v-else-if="needsDownload"
    :class="[styles.placeholder, styles.tappable, className]"
    :style="{
      maxWidth,
      maxHeight,
      borderRadius,
      ...(typeof style === 'object' && style ? style : {}),
    }"
    @click="handleDownload"
  >
    <DownloadOutlined :class="styles.downloadIcon" />
    <span :class="styles.downloadText">
      {{ t('chat.tapToDownloadImage') }}
    </span>
  </div>
  <!-- loading / 无 bizId 时沿用 AppImage 的加载与错误态 -->
  <div v-else :class="styles.imageWrap">
    <div @click="handlePreviewClick">
      <AppImage
        :src="resolvedSrc"
        :loading="loading || autoDownload || checkingLocal"
        :alt="alt || t('chat.imageMessage')"
        :class-name="className"
        :style="style"
        :max-width="maxWidth"
        :max-height="maxHeight"
        :border-radius="borderRadius"
      />
    </div>
    <template v-if="sending">
      <div v-if="uploadIndeterminate" :class="styles.uploadOverlay" :style="{ borderRadius }">
        <div :class="styles.uploadIndeterminateWrap">
          <span :class="styles.uploadPhaseText">
            {{ t(sendPhase === 'compressing' ? 'chat.compressing' : 'chat.reading') }}
          </span>
          <div :class="styles.uploadIndeterminate" />
        </div>
      </div>
      <div v-else :class="styles.uploadOverlay" :style="{ borderRadius }">
        <a-progress
          type="circle"
          :percent="uploadPercent"
          :size="44"
          stroke-color="#ffffff"
          trail-color="rgba(255, 255, 255, 0.3)"
          :format="(p: number) => `${p}%`"
        />
      </div>
    </template>
  </div>
</template>
