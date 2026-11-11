<script setup lang="ts">
/**
 * 连接状态标签
 */
import type { ConnectionState } from '../hooks/useWebRTCCall';
import { useI18n } from '@/i18n';

defineProps<{ status: ConnectionState }>();

const { t } = useI18n();
</script>

<template>
  <a-tag v-if="status === 'connected'" color="success">
    {{ t('webrtc.connected') }}
  </a-tag>
  <a-tag v-else-if="status === 'connecting'" color="warning">
    {{ t('webrtc.connecting') }}
  </a-tag>
  <a-tag v-else-if="status === 'disconnected'" color="error">
    {{ t('webrtc.disconnected') }}
  </a-tag>
  <a-tag v-else-if="status === 'failed'" color="error">
    {{ t('webrtc.connectionFailed') }}
  </a-tag>
</template>
