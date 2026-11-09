<script setup lang="ts">
import { ref } from 'vue';
import { DisconnectOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/utils/feedback';
import styles from './QuicDisconnectButton.module.less';

const loading = ref(false);

const handleDisconnect = async () => {
  try {
    loading.value = true;
    await invoke('disconnect_quic_command');
    feedback.message.success('QUIC连接已断开');
  } catch (error) {
    feedback.message.error(`断开连接失败: ${error}`);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-tooltip title="断开QUIC连接" placement="bottom">
    <div
      :class="styles.quicButton"
      :style="{ opacity: loading ? 0.5 : 1 }"
      @click="handleDisconnect"
    >
      <DisconnectOutlined :spin="loading" />
    </div>
  </a-tooltip>
</template>
