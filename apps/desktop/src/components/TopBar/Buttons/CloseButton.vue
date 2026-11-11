<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue';
import { Window } from '@tauri-apps/api/window';
import styles from './CloseButton.module.less';

const closeWindow = async () => {
  await Window.getCurrent().close();
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.content" @click="closeWindow">
      <CloseOutlined />
    </div>
  </div>
</template>
