<script setup lang="ts">
import { useBackendEvent } from '@/hooks/useBackendEvent';
import type { P2pInitMsg } from '@workspace/types';

console.log('渲染了接受视频流组件');
useBackendEvent('listen_p2p_request', (payload) => {
  console.log('接收到的数据', payload);
  const quicMsgList = JSON.parse(payload) as P2pInitMsg[];
  console.log('quicMsgList', quicMsgList);
  // TODO接收后端消息，选择对应操作逻辑
});
</script>

<template>
  <!-- 无 UI，仅注册后端事件监听 -->
  <span style="display: none" />
</template>
