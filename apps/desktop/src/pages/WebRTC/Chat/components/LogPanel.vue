<script setup lang="ts">
/**
 * 日志面板
 */
import type { Ref } from 'vue';
import type { WebRTCLogEntry } from '../hooks/useWebRTCCall';
import { useI18n } from '@/i18n';
import styles from '../index.module.less';

defineProps<{
  logs: WebRTCLogEntry[];
  logContainerRef: Ref<HTMLDivElement | null>;
}>();

const emit = defineEmits<{ (e: 'clear'): void }>();

const { t } = useI18n();

const formatLogTime = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, '0')}`;
};

const logLevelClass = (level: string) => {
  if (level === 'warn') return styles.logWarn;
  if (level === 'error') return styles.logError;
  return styles.logInfo;
};
</script>

<template>
  <div :class="styles.logPanel">
    <div :class="styles.logHeader">
      <span :class="styles.logTitle">{{ t('webrtc.logTitle') }}</span>
      <a-button size="small" @click="emit('clear')">
        {{ t('webrtc.clearLogs') }}
      </a-button>
    </div>
    <div :ref="logContainerRef" :class="styles.logBody">
      <div v-if="logs.length === 0" :class="styles.logEmpty">
        {{ t('webrtc.logEmpty') }}
      </div>
      <div v-for="log in logs" :key="log.id" :class="styles.logLine">
        <span :class="styles.logTime">{{ formatLogTime(log.timestamp) }}</span>
        <span :class="[styles.logLevel, logLevelClass(log.level)]">
          [{{ log.level.toUpperCase() }}]
        </span>
        <span :class="styles.logMessage">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
