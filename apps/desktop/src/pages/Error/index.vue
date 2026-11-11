<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { useRouter } from 'vue-router';
import { useI18n } from '@/i18n';

const router = useRouter();
const { t } = useI18n();

const handleBackHome = async () => {
  try {
    const uuid = (await invoke('get_user_map', { key: 'uuid' })) as string;
    if (uuid !== null && uuid !== undefined && uuid !== '') {
      router.push('/home');
    } else {
      router.push('/signIn');
    }
  } catch {
    router.push('/signIn');
  }
};
</script>

<template>
  <div class="not-found">
    <a-result
      status="404"
      title="404"
      :sub-title="t('not-found')"
    >
      <template #extra>
        <a-button type="primary" @click="handleBackHome">
          {{ t('back') }}
        </a-button>
      </template>
    </a-result>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  height: 100vh;
  align-items: center;
  justify-content: center;
}
</style>
