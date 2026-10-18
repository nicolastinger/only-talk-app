<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { showToast } from "vant";
import { convertPathToTauriUrl } from "@workspace/services";
import { loadChatFile } from "@/chat/media";
import { useI18n } from "@/i18n";

const props = defineProps<{
  /** 服务器记录 biz_id（发送中的本地临时消息为空） */
  bizId?: string;
  /** 录音时长（秒） */
  duration: number;
  nanoId?: string;
  /** 发送中的本地绝对路径（乐观气泡，可即时播放） */
  localPath?: string;
  /** 是否上传中(展示上传进度) */
  sending?: boolean;
  uploadProgress?: number;
  sendPhase?: "reading" | "compressing" | "uploading";
}>();

const { t } = useI18n();

const WAVE_BARS = 5;
/** 气泡宽度随录音时长增长（微信式）：80~200px */
const bubbleWidth = computed(() =>
  Math.min(200, Math.max(80, 80 + (props.duration || 0) * 4))
);
const durationText = computed(() => {
  const s = Math.max(0, Math.round(props.duration || 0));
  return s >= 60 ? `${Math.floor(s / 60)}'${s % 60}"` : `${s}"`;
});

const uploadPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.uploadProgress ?? 0)))
);
const uploadIndeterminate = computed(() => props.sendPhase !== "uploading");
const uploadStatusText = computed(() =>
  uploadIndeterminate.value
    ? props.sendPhase === "compressing"
      ? t("chat.compressing")
      : t("chat.reading")
    : t("chat.uploadingPercent", { percent: uploadPercent.value })
);

const audio = ref<HTMLAudioElement | null>(null);
const srcUrl = ref<string | null>(null);
const playing = ref(false);
const loading = ref(false);

const ensureSrc = async (): Promise<string | null> => {
  if (srcUrl.value) return srcUrl.value;
  if (props.localPath) {
    srcUrl.value = convertPathToTauriUrl(props.localPath);
    return srcUrl.value;
  }
  if (!props.bizId) return null;
  const file = await loadChatFile(props.bizId, props.nanoId);
  const url = file?.tauri_file_path || null;
  if (url) srcUrl.value = url;
  return url;
};

const bindAudio = (url: string) => {
  const el = audio.value ?? new Audio();
  el.preload = "auto";
  el.src = url;
  el.onended = () => {
    playing.value = false;
  };
  el.onerror = () => {
    playing.value = false;
    showToast({ message: t("chat.voice.playFailed"), icon: "fail" });
  };
  audio.value = el;
};

const toggle = async () => {
  if (props.sending) return;
  if (playing.value) {
    audio.value?.pause();
    playing.value = false;
    return;
  }
  if (loading.value) return;
  loading.value = true;
  try {
    const url = await ensureSrc();
    if (!url) {
      showToast({ message: t("chat.voice.playFailed"), icon: "fail" });
      return;
    }
    if (!audio.value || audio.value.src !== url) bindAudio(url);
    await audio.value?.play();
    playing.value = true;
  } catch (e) {
    console.error("播放语音失败:", e);
    showToast({ message: t("chat.voice.playFailed"), icon: "fail" });
  } finally {
    loading.value = false;
  }
};

onUnmounted(() => {
  audio.value?.pause();
  audio.value = null;
});
</script>

<template>
  <div
    class="voice-msg"
    :class="{ sending }"
    :style="{ width: bubbleWidth + 'px' }"
    @click="toggle"
  >
    <span class="voice-play" :class="{ playing }">
      <span v-if="loading" class="spinner" />
      <svg v-else-if="playing" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>

    <span class="voice-wave">
      <i v-for="i in WAVE_BARS" :key="i" class="wave-bar" />
    </span>

    <span class="voice-duration">{{ durationText }}</span>

    <span v-if="sending" class="voice-upload">
      <span v-if="uploadIndeterminate" class="upload-indeterminate" />
      <span v-else class="upload-bar" :style="{ width: uploadPercent + '%' }" />
      <span class="upload-text">{{ uploadStatusText }}</span>
    </span>
  </div>
</template>

<style scoped lang="less">
.voice-msg {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  &:active {
    opacity: 0.85;
  }
}
.voice-play {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  svg {
    width: 20px;
    height: 20px;
  }
}
.voice-wave {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1;
  .wave-bar {
    display: block;
    width: 3px;
    height: 8px;
    border-radius: 2px;
    background: currentColor;
    opacity: 0.55;
  }
  .wave-bar:nth-child(2) {
    height: 14px;
  }
  .wave-bar:nth-child(3) {
    height: 10px;
  }
  .wave-bar:nth-child(4) {
    height: 16px;
  }
  .wave-bar:nth-child(1) {
    height: 12px;
  }
}
.voice-duration {
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}
.voice-upload {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 2px;
  overflow: hidden;
}
.upload-bar {
  display: block;
  height: 100%;
  background: currentColor;
}
.upload-indeterminate {
  display: block;
  height: 100%;
  width: 40%;
  background: currentColor;
  animation: voice-upload-slide 1.1s ease-in-out infinite;
}
@keyframes voice-upload-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}
.upload-text {
  display: none;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: voice-spin 0.8s linear infinite;
}
@keyframes voice-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
