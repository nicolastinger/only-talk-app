<script setup lang="ts">
import { useBearStore } from '@/stores/app';
import styles from './index.module.less';

const store = useBearStore();
</script>

<template>
  <div v-if="store.isSyncing" :class="styles.overlay">
    <a-spin size="large" tip="正在同步离线消息..." />
  </div>
</template>
