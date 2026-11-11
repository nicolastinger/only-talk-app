<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { showToast } from "vant";
import { useI18n } from "@/i18n";
import {
  VOICE_MAX_DURATION,
  VOICE_MIN_DURATION,
  VoiceRecorder,
  type VoiceRecordingResult,
} from "@/chat/useVoiceRecorder";

const props = withDefaults(
  defineProps<{
    show: boolean;
    maxDuration?: number;
  }>(),
  { maxDuration: VOICE_MAX_DURATION }
);

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "send", result: VoiceRecordingResult): void;
}>();

const { t } = useI18n();
const recorder = new VoiceRecorder();

const elapsed = ref(0);
const busy = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;
let autoStopped = false;

const maxDuration = computed(() => props.maxDuration || VOICE_MAX_DURATION);
const progress = computed(() =>
  Math.min(100, Math.round((elapsed.value / maxDuration.value) * 100))
);

const formatSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const clearTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const close = (value: boolean) => emit("update:show", value);

const startRecording = async () => {
  elapsed.value = 0;
  autoStopped = false;
  try {
    await recorder.start();
  } catch (e) {
    console.error("开始录音失败:", e);
    showToast({ message: t("chat.voice.startFailed"), icon: "fail" });
    close(false);
    return;
  }
  clearTimer();
  timer = setInterval(() => {
    elapsed.value = recorder.elapsedSeconds();
    if (elapsed.value >= maxDuration.value) {
      autoStopped = true;
      void stopAndSend();
    }
  }, 200);
};

const stopAndSend = async () => {
  if (busy.value) return;
  busy.value = true;
  clearTimer();
  try {
    const result = await recorder.stop();
    if (result.duration < VOICE_MIN_DURATION) {
      showToast({ message: t("chat.voice.tooShort"), icon: "fail" });
      close(false);
      return;
    }
    close(false);
    emit("send", result);
  } catch (e) {
    console.error("录音落盘失败:", e);
    showToast({ message: t("chat.voice.failed"), icon: "fail" });
    close(false);
  } finally {
    busy.value = false;
  }
};

const cancelRecording = () => {
  clearTimer();
  recorder.cancel();
  close(false);
};

watch(
  () => props.show,
  (show) => {
    if (show) {
      void startRecording();
    } else {
      clearTimer();
      recorder.cancel();
      elapsed.value = 0;
    }
  }
);

onUnmounted(() => {
  clearTimer();
  recorder.cancel();
});
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    :close-on-click-overlay="false"
    :safe-area-inset-bottom="true"
    @update:show="close"
  >
    <div class="voice-record">
      <div class="voice-hint">
        {{ autoStopped || elapsed >= maxDuration ? t("chat.voice.maxDuration", { seconds: maxDuration }) : t("chat.voice.recording") }}
      </div>

      <div class="voice-wave">
        <span
          v-for="i in 7"
          :key="i"
          class="wave-bar"
          :style="{ animationDelay: `${i * 0.08}s` }"
        />
      </div>

      <div class="voice-timer">{{ formatSeconds(elapsed) }}</div>
      <div class="voice-progress">
        <div class="voice-progress-inner" :style="{ width: progress + '%' }" />
      </div>

      <div class="voice-actions">
        <button class="voice-btn cancel" :disabled="busy" @click="cancelRecording">
          {{ t("chat.voice.cancel") }}
        </button>
        <button
          class="voice-btn stop"
          :disabled="busy"
          @click="stopAndSend"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
          {{ t("chat.voice.tapToStop") }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.voice-record {
  padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.voice-hint {
  font-size: 14px;
  color: var(--text-secondary);
}
.voice-wave {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 40px;
}
.wave-bar {
  width: 5px;
  height: 12px;
  border-radius: 3px;
  background: var(--brand-blue);
  animation: voice-wave 0.9s ease-in-out infinite;
}
@keyframes voice-wave {
  0%,
  100% {
    height: 12px;
    opacity: 0.6;
  }
  50% {
    height: 36px;
    opacity: 1;
  }
}
.voice-timer {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.voice-progress {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border-light);
  overflow: hidden;
}
.voice-progress-inner {
  height: 100%;
  background: var(--gradient-primary);
  transition: width 0.2s linear;
}
.voice-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 4px;
}
.voice-btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  &:disabled {
    opacity: 0.6;
  }
  svg {
    width: 18px;
    height: 18px;
  }
  &.cancel {
    background: var(--surface);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }
  &.stop {
    background: var(--gradient-primary);
    color: #fff;
    box-shadow: var(--shadow-sm);
  }
}
</style>
