<script setup lang="ts">
import { ref } from 'vue';
import { DisconnectOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './QuicDisconnectButton.module.less';

const { t } = useI18n();
const loading = ref(false);

const handleDisconnect = async () => {
  try {
    loading.value = true;
    await invoke('disconnect_quic_command');
    feedback.message.success(t('quicDisconnect.disconnectSuccess'));
  } catch (error) {
    feedback.message.error(
      t('quicDisconnect.disconnectFailed', { error: String(error) }),
    );
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-tooltip :title="t('quicDisconnect.disconnect')" placement="bottom">
    <div
      :class="styles.quicButton"
      :style="{ opacity: loading ? 0.5 : 1 }"
      @click="handleDisconnect"
    >
      <DisconnectOutlined :spin="loading" />
    </div>
  </a-tooltip>
</template>
