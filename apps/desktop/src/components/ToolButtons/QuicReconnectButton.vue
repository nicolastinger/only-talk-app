<script setup lang="ts">
import { ref } from 'vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/utils/feedback';
import styles from './QuicReconnectButton.module.less';

const loading = ref(false);

const handleReconnect = async () => {
  try {
    loading.value = true;
    await invoke('reconnect_quic_command');
    feedback.message.success('QUIC重连请求已发送');
  } catch (error) {
    feedback.message.error(`重连失败: ${error}`);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-tooltip title="重新连接QUIC" placement="bottom">
    <div
      :class="styles.quicButton"
      :style="{ opacity: loading ? 0.5 : 1 }"
      @click="handleReconnect"
    >
      <ReloadOutlined :spin="loading" />
    </div>
  </a-tooltip>
</template>
