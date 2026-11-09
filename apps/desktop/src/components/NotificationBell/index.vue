<script setup lang="ts">
import { BellOutlined } from '@ant-design/icons-vue';
import styles from './index.module.less';

withDefaults(
  defineProps<{
    count?: number;
    title?: string;
  }>(),
  {
    count: 0,
    title: '本页通知',
  },
);

defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <div :class="styles.notifyBtn" :title="title" @click="$emit('click')">
    <a-badge :count="count > 99 ? '99+' : count" :overflow-count="99">
      <BellOutlined />
    </a-badge>
  </div>
</template>
