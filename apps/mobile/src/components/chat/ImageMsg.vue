<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { checkLocalChatFile, loadChatFile, loadImageUrl } from "@/chat/media";
import { useI18n } from "@/i18n";

const props = defineProps<{
  src?: string | null;
  loading?: boolean;
  alt?: string;
  /** 服务器图片业务 ID（无本地文件且不允许自动下载时展示点击下载） */
  bizId?: string;
  nanoId?: string;
  /** 是否允许在非计量网络下自动下载（发送方的本地图片恒为 true） */
  allowAutoDownload?: boolean;
  /** 是否正在发送（发送中展示进度遮罩） */
  sending?: boolean;
  /** 上传进度百分比 0-100 */
  uploadProgress?: number;
  /** 发送阶段：reading/compressing/uploading */
  sendPhase?: "reading" | "compressing" | "uploading";
}>();

const emit = defineEmits<{
  (e: "preview"): void;
}>();

const { t } = useI18n();

const error = ref(false);
/** 手动下载后解析出的本地 URL（优先复用父级传入的 src） */
const localUrl = ref<string | null>(null);
/** 本地是否已存在该图片（存在则直接展示，无需下载） */
const hasLocal = ref(false);
const checking = ref(false);
const downloading = ref(false);
const progress = ref<{ downloaded: number; total: number }>({
  downloaded: 0,
  total: 0,
});
const progressPercent = computed(() => {
  const total = progress.value.total;
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((progress.value.downloaded / total) * 100));
});

const resolvedUrl = computed(() => props.src || localUrl.value);
const showImage = computed(() => !!resolvedUrl.value && !error.value);
/** 无本地文件、不允许自动下载、非加载中 → 展示点击下载占位 */
const needsDownload = computed(
  () =>
    !showImage.value &&
    !props.loading &&
    !!props.bizId &&
    !checking.value &&
    !downloading.value
);

const uploadPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.uploadProgress ?? 0)))
);
/** 读取/压缩阶段无字节进度，展示不确定动画 */
const uploadIndeterminate = computed(() => props.sendPhase !== "uploading");
const uploadStatusText = computed(() => {
  if (!uploadIndeterminate.value) return `${uploadPercent.value}%`;
  return props.sendPhase === "compressing"
    ? t("chat.compressing")
    : t("chat.reading");
});

const onImgError = () => {
  error.value = true;
};

const onClick = () => {
  if (props.sending) return;
  if (showImage.value) emit("preview");
  else if (needsDownload.value) void downloadImage();
};

/** 只查本地是否已下载，不触发远程下载；已存在则直接解析展示 */
const refreshLocal = async () => {
  if (props.src) return;
  error.value = false;
  localUrl.value = null;
  if (!props.bizId) {
    hasLocal.value = false;
    checking.value = false;
    return;
  }
  checking.value = true;
  hasLocal.value = await checkLocalChatFile(props.bizId);
  checking.value = false;
  if (!hasLocal.value) return;
  // 本地已有：优先用缓存解析；缓存曾为 null（如历史失败）时回退直接取本地文件
  let url = await loadImageUrl(props.bizId, props.nanoId);
  if (!url) {
    const file = await loadChatFile(props.bizId, props.nanoId);
    url = file?.tauri_file_path || null;
  }
  if (url) localUrl.value = url;
};

/** 点击下载：展示进度条，完成后直接显示图片 */
const downloadImage = async () => {
  if (downloading.value || !props.bizId) return;
  downloading.value = true;
  error.value = false;
  progress.value = { downloaded: 0, total: 0 };
  try {
    const file = await loadChatFile(props.bizId, props.nanoId, (p) => {
      progress.value = { downloaded: p.downloaded, total: p.total };
    });
    if (file?.tauri_file_path) {
      localUrl.value = file.tauri_file_path;
      hasLocal.value = true;
    } else {
      error.value = true;
    }
  } catch (e) {
    console.error("图片下载失败:", props.bizId, e);
    error.value = true;
  } finally {
    downloading.value = false;
  }
};

onMounted(refreshLocal);
watch(
  () => props.bizId,
  () => refreshLocal()
);
</script>

<template>
  <div class="image-msg">
    <div v-if="showImage" class="image-wrap">
      <img
        :src="resolvedUrl!"
        :alt="alt || t('chat.imageMessage')"
        class="img"
        @click="onClick"
        @error="onImgError"
      />
      <div v-if="sending" class="upload-overlay">
        <span class="upload-spinner"></span>
        <span class="upload-percent">{{ uploadStatusText }}</span>
        <div v-if="uploadIndeterminate" class="upload-indeterminate"></div>
        <van-progress
          v-else
          class="upload-bar"
          :percentage="uploadPercent"
          :show-pivot="false"
          :stroke-width="3"
          color="#ffffff"
          track-color="rgba(255, 255, 255, 0.35)"
        />
      </div>
    </div>

    <div v-else-if="sending" class="image-sending">
      <span class="sending-spinner"></span>
      <span class="sending-text">{{ uploadStatusText }}</span>
      <div v-if="uploadIndeterminate" class="sending-indeterminate">
        <div class="sending-indeterminate-inner"></div>
      </div>
      <van-progress
        v-else
        class="progress"
        :percentage="uploadPercent"
        :show-pivot="false"
        :stroke-width="4"
        color="var(--brand-blue)"
        track-color="var(--border-light)"
      />
    </div>

    <div v-else-if="downloading" class="image-downloading">
      <van-progress
        :percentage="progressPercent"
        :show-pivot="progress.total > 0"
        :stroke-width="4"
        color="var(--brand-blue)"
        track-color="var(--border-light)"
        class="progress"
      />
      <span class="download-text">
        {{ t("chat.downloadingPercent", { percent: progressPercent }) }}
      </span>
    </div>

    <div
      v-else-if="needsDownload"
      class="image-placeholder tappable"
      @click="downloadImage"
    >
      <svg class="download-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
      </svg>
      <span class="download-label">{{ t("chat.tapToDownloadImage") }}</span>
    </div>

    <div v-else-if="loading || checking" class="image-placeholder">
      <span>{{ t("common.loadingDots") }}</span>
    </div>

    <div v-else class="image-placeholder">
      <span>{{ t("chat.imageLoadFailed") }}</span>
    </div>
  </div>
</template>

<style scoped lang="less">
.image-msg {
  .image-wrap {
    position: relative;
    display: inline-block;
    line-height: 0;
  }
  .img {
    max-width: 220px;
    max-height: 300px;
    border-radius: 10px;
    box-shadow: var(--shadow-md);
    object-fit: cover;
    display: block;
  }
}
.upload-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  box-sizing: border-box;
  color: #fff;
}
.upload-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: upload-spin 0.8s linear infinite;
}
.upload-percent {
  font-size: 12px;
  font-weight: 600;
}
.upload-bar {
  width: 100%;
  margin-top: 2px;
}
.upload-indeterminate {
  position: relative;
  width: 100%;
  height: 3px;
  margin-top: 2px;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.35);

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 40%;
    border-radius: 2px;
    background: #fff;
    animation: upload-slide 1.1s ease-in-out infinite;
  }
}
@keyframes upload-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes upload-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}
.image-placeholder {
  width: 140px;
  height: 105px;
  border-radius: 10px;
  background: var(--surface-alt);
  border: 1px dashed var(--border-medium);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-placeholder);

  &.tappable {
    cursor: pointer;
    &:active {
      background: var(--surface-hover);
    }
  }
}
.image-downloading {
  width: 140px;
  height: 105px;
  border-radius: 10px;
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  box-sizing: border-box;

  .progress {
    width: 100%;
  }
  .download-text {
    font-size: 12px;
    color: var(--brand-blue);
  }
}
.image-sending {
  width: 140px;
  height: 105px;
  border-radius: 10px;
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  box-sizing: border-box;

  .progress {
    width: 100%;
  }
}
.sending-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-medium);
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: upload-spin 0.8s linear infinite;
}
.sending-text {
  font-size: 12px;
  color: var(--brand-blue);
}
.sending-indeterminate {
  position: relative;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--border-light);

  .sending-indeterminate-inner {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 40%;
    border-radius: 2px;
    background: var(--brand-blue);
    animation: upload-slide 1.1s ease-in-out infinite;
  }
}
.download-icon {
  width: 24px;
  height: 24px;
  color: var(--brand-blue);
}
.download-label {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
