<script setup lang="ts">
import { computed } from 'vue';
import type { StatusTagState } from '@/hooks/useQuicDisconnect';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const props = defineProps<{
  statusTag: StatusTagState | null;
}>();

const { t } = useI18n();

const text = computed(() => {
  if (!props.statusTag) return '';
  const map: Record<string, string> = {
    offline: t('homeLayout.connOffline'),
    reconnecting: t('homeLayout.connReconnecting'),
    online: t('homeLayout.connOnline'),
  };
  return map[props.statusTag] || '';
});
</script>

<template>
  <div
    v-if="statusTag"
    :class="[styles.statusTag, styles[statusTag]]"
  >
    <span v-if="statusTag === 'reconnecting'" :class="styles.spinner" />
    <span>{{ text }}</span>
  </div>
</template>
