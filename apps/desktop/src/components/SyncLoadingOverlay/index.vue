<script setup lang="ts">
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const store = useBearStore();
</script>

<template>
  <div v-if="store.isSyncing" :class="styles.overlay">
    <a-spin size="large" :tip="t('sync.syncing')" />
  </div>
</template>
