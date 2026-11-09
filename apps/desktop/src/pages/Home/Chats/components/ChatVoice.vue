<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import {
  CaretRightOutlined,
  LoadingOutlined,
  PauseOutlined,
} from '@ant-design/icons-vue';
import { convertPathToTauriUrl, getChatFileByBizId } from '@workspace/services';
import { feedback } from '@/utils/feedback';
import styles from './styles/ChatVoice.module.less';

const props = withDefaults(
  defineProps<{
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
    sendPhase?: string;
  }>(),
  {
    sending: false,
    uploadProgress: 0,
  },
);

const WAVE_BARS = 5;

/** 秒数格式化为语音时长：>=60s 用 m'ss" */
const formatVoiceDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds || 0));
  return s >= 60 ? `${Math.floor(s / 60)}'${s % 60}"` : `${s}"`;
};

const playing = ref(false);
const loading = ref(false);
/** 当前播放进度（秒） */
const currentTime = ref(0);
/** 音频真实时长（秒；metadata 加载后可用，0 表示未知） */
const audioDuration = ref(0);

let audioEl: HTMLAudioElement | null = null;
let srcUrl: string | null = null;

const width = computed(() => Math.min(200, Math.max(80, 80 + (props.duration || 0) * 4)));
/** 总时长：优先用音频真实时长，回退消息里的录音时长 */
const totalSeconds = computed(() =>
  audioDuration.value > 0 ? Math.round(audioDuration.value) : props.duration || 0,
);
/** 播放倒计时（剩余秒数） */
const remainingSeconds = computed(() =>
  Math.max(0, Math.ceil(totalSeconds.value - currentTime.value)),
);
/** 播放中/暂停在中途时展示剩余秒数，否则展示总时长 */
const showRemaining = computed(() => playing.value || currentTime.value > 0);
const durationText = computed(() =>
  formatVoiceDuration(
    showRemaining.value ? remainingSeconds.value : totalSeconds.value,
  ),
);

const uploadPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.uploadProgress))),
);
const uploadIndeterminate = computed(
  () => props.sending && props.sendPhase !== 'uploading',
);

const ensureSrc = async (): Promise<string | null> => {
  if (srcUrl) return srcUrl;
  if (props.localPath) {
    srcUrl = convertPathToTauriUrl(props.localPath);
    return srcUrl;
  }
  if (!props.bizId) return null;
  const files = await getChatFileByBizId(props.bizId, props.nanoId);
  const url = files?.[0]?.tauri_file_path || null;
  if (url) srcUrl = url;
  return url;
};

const bindAudio = (url: string) => {
  const el = audioEl ?? new Audio();
  el.preload = 'auto';
  // 新音源：重置进度与已知时长
  currentTime.value = 0;
  audioDuration.value = 0;
  el.onloadedmetadata = () => {
    audioDuration.value =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
  };
  el.ontimeupdate = () => {
    currentTime.value = el.currentTime || 0;
  };
  el.onended = () => {
    playing.value = false;
    currentTime.value = 0;
  };
  el.onerror = () => {
    playing.value = false;
    currentTime.value = 0;
    feedback.message.error('语音播放失败');
  };
  el.src = url;
  audioEl = el;
};

const toggle = async () => {
  if (props.sending || loading.value) return;
  if (playing.value) {
    audioEl?.pause();
    playing.value = false;
    return;
  }
  loading.value = true;
  try {
    const url = await ensureSrc();
    if (!url) {
      feedback.message.error('语音播放失败');
      return;
    }
    if (!audioEl || audioEl.src !== url) bindAudio(url);
    await audioEl?.play();
    playing.value = true;
  } catch (e) {
    console.error('播放语音失败:', e);
    feedback.message.error('语音播放失败');
  } finally {
    loading.value = false;
  }
};

onUnmounted(() => {
  audioEl?.pause();
  audioEl = null;
});
</script>

<template>
  <div :class="styles.container" :style="{ width }" role="button" tabindex="0" @click="toggle">
    <span :class="styles.playBtn">
      <LoadingOutlined v-if="loading" />
      <PauseOutlined v-else-if="playing" />
      <CaretRightOutlined v-else />
    </span>
    <span :class="styles.wave">
      <i v-for="i in WAVE_BARS" :key="i" :class="styles.waveBar" />
    </span>
    <span :class="styles.duration">{{ durationText }}</span>
    <span v-if="sending" :class="styles.uploadBar">
      <span
        :class="uploadIndeterminate ? styles.uploadIndeterminate : styles.uploadProgress"
        :style="uploadIndeterminate ? undefined : { width: `${uploadPercent}%` }"
      />
    </span>
  </div>
</template>
