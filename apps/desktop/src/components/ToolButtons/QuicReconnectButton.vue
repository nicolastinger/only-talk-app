<script setup lang="ts">
import { ref } from 'vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './QuicReconnectButton.module.less';

const { t } = useI18n();
const loading = ref(false);

const handleReconnect = async () => {
  try {
    loading.value = true;
    await invoke('reconnect_quic_command');
    feedback.message.success(t('quicDisconnect.reconnectRequested'));
  } catch (error) {
    feedback.message.error(
      t('quicDisconnect.reconnectFailed', { error: String(error) }),
    );
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-tooltip :title="t('quicDisconnect.reconnect')" placement="bottom">
    <div
      :class="styles.quicButton"
      :style="{ opacity: loading ? 0.5 : 1 }"
      @click="handleReconnect"
    >
      <ReloadOutlined :spin="loading" />
    </div>
  </a-tooltip>
</template>
