<script setup lang="ts">
import { App } from 'ant-design-vue';
import { bindFeedback } from '@/utils/feedback';

// 在 <a-app> 子树内绑定 message/modal/notification 实例，让静态调用跟随主题
const { message, modal, notification } = App.useApp();
bindFeedback({ message, modal, notification });
</script>

<template>
  <span style="display: none" />
</template>
