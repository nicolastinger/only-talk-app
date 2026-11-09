<script setup lang="ts">
import { BulbFilled, BulbOutlined } from '@ant-design/icons-vue';
import { useTheme } from '@/hooks/useTheme';
import styles from './ThemeButton.module.less';

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
    :title="mode === 'dark' ? '切换亮色主题' : '切换暗色主题'"
    placement="bottom"
  >
    <div :class="styles.themeButton" @click="toggleTheme">
      <BulbFilled v-if="mode === 'dark'" />
      <BulbOutlined v-else />
    </div>
  </a-tooltip>
</template>
