<script setup lang="ts">
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/i18n';

const { mode, setMode } = useTheme();
const { t } = useI18n();

const changeThemeColor = (e: MouseEvent) => {
  setMode(mode.value === 'dark' ? 'light' : 'dark', {
    x: e.clientX,
    y: e.clientY,
  });
};
</script>

<template>
  <div @click="changeThemeColor">{{ t('settings.generalSettings.theme') }}</div>
</template>
