<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { CompressOutlined, ExpandOutlined } from '@ant-design/icons-vue';
import { Window } from '@tauri-apps/api/window';
import styles from './MaximizeButton.module.less';

const isMaximized = ref(false);

onMounted(async () => {
  isMaximized.value = await Window.getCurrent().isMaximized();
});

const toggleMaximize = async () => {
  const currentWindow = Window.getCurrent();
  const maximized = await currentWindow.isMaximized();
  if (maximized) {
    await currentWindow.unmaximize();
    isMaximized.value = false;
  } else {
    await currentWindow.maximize();
    isMaximized.value = true;
  }
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.content" @click="toggleMaximize">
      <CompressOutlined v-if="isMaximized" />
      <ExpandOutlined v-else />
    </div>
  </div>
</template>
