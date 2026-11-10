<script setup lang="ts">
import { BulbFilled, BulbOutlined } from '@ant-design/icons-vue';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/i18n';
import styles from './ThemeButton.module.less';

const { t } = useI18n();
const { mode, setMode } = useTheme();

const toggleTheme = (e: MouseEvent) => {
  setMode(mode.value === 'dark' ? 'light' : 'dark', {
    x: e.clientX,
    y: e.clientY,
  });
};
</script>

<template>
  <a-tooltip
    :title="
      mode === 'dark'
        ? t('settings.generalSettings.switchLightTheme')
        : t('settings.generalSettings.switchDarkTheme')
    "
    placement="bottom"
  >
    <div :class="styles.themeButton" @click="toggleTheme">
      <BulbFilled v-if="mode === 'dark'" />
      <BulbOutlined v-else />
    </div>
  </a-tooltip>
</template>
