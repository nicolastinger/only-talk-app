<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  VOICE_MAX_DURATION,
  VOICE_MIN_DURATION,
  VoiceRecorder,
  type VoiceRecordingResult,
} from '@/utils/voiceRecorder';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/VoiceRecordModal.module.less';

const props = withDefaults(
  defineProps<{
    open: boolean;
    maxDuration?: number;
  }>(),
  {
    maxDuration: VOICE_MAX_DURATION,
  },
);

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'send', result: VoiceRecordingResult): void;
}>();

const { t } = useI18n();
const recorder = new VoiceRecorder();
const elapsed = ref(0);
const busy = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const formatSeconds = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const clearTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const stopAndSend = async () => {
  if (busy.value) return;
  busy.value = true;
  clearTimer();
  try {
    const result = await recorder.stop();
    if (result.duration < VOICE_MIN_DURATION) {
      feedback.message.warning(t('chat.voice.tooShort'));
      emit('cancel');
      return;
    }
    emit('send', result);
    emit('cancel');
  } catch (e) {
    console.error('录音落盘失败:', e);
    feedback.message.error(t('chat.voice.failed'));
    emit('cancel');
  } finally {
    busy.value = false;
  }
};

watch(
  () => props.open,
  (open, _old, onCleanup) => {
    if (!open) {
      clearTimer();
      recorder.cancel();
      elapsed.value = 0;
      return;
    }

    let disposed = false;
    (async () => {
      try {
        await recorder.start();
      } catch (e) {
        console.error('开始录音失败:', e);
        feedback.message.error(t('chat.voice.startFailed'));
        emit('cancel');
        return;
      }
      if (disposed) {
        recorder.cancel();
        return;
      }
      clearTimer();
      timer = setInterval(() => {
        const s = recorder.elapsedSeconds();
        elapsed.value = s;
        if (s >= props.maxDuration) {
          void stopAndSend();
        }
      }, 200);
    })();

    onCleanup(() => {
      disposed = true;
      clearTimer();
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  clearTimer();
  recorder.cancel();
});

const progress = computed(() =>
  Math.min(100, Math.round((elapsed.value / props.maxDuration) * 100)),
);

const handleCancel = () => {
  clearTimer();
  recorder.cancel();
  emit('cancel');
};
</script>

<template>
  <a-modal
    :open="open"
    :title="t('chat.voice.recording')"
    :footer="null"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    :width="360"
    @cancel="handleCancel"
  >
    <div :class="styles.container">
      <div :class="styles.wave">
        <span
          v-for="i in 7"
          :key="i"
          :class="styles.waveBar"
          :style="{ animationDelay: `${(i - 1) * 0.08}s` }"
        />
      </div>
      <div :class="styles.timer">{{ formatSeconds(elapsed) }}</div>
      <div :class="styles.progress">
        <div :class="styles.progressInner" :style="{ width: `${progress}%` }" />
      </div>
      <div :class="styles.hint">
        {{ t('chat.voice.maxDuration', { seconds: maxDuration }) }}
      </div>
      <div :class="styles.actions">
        <button
          type="button"
          :class="styles.cancelBtn"
          :disabled="busy"
          @click="handleCancel"
        >
          {{ t('chat.voice.cancel') }}
        </button>
        <button
          type="button"
          :class="styles.stopBtn"
          :disabled="busy"
          @click="stopAndSend"
        >
          {{ t('chat.voice.tapToStop') }}
        </button>
      </div>
    </div>
  </a-modal>
</template>
