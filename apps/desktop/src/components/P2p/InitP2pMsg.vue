<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const localAddr = ref<string>();
const remoteAddr = ref<string>();

const sendP2pMsg = async () => {
  console.log('发送参数', localAddr.value, remoteAddr.value);
  const res = await invoke('send_udp_p2p_init_msg', {
    localAddr: localAddr.value,
    remoteAddr: remoteAddr.value,
  });
  console.log('发送结果', res, localAddr.value);
};
</script>

<template>
  <div>
    <a-input v-model:value="localAddr" placeholder="发送方" />
    <a-input v-model:value="remoteAddr" placeholder="接收方" />
    <a-button @click="sendP2pMsg">发送p2p消息</a-button>
  </div>
</template>
