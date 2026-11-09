<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="home-layout-placeholder">
    <div class="home-layout-placeholder__bar">
      HomeLayout 迁移中：{{ route.fullPath }}
    </div>
    <div class="home-layout-placeholder__body">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.home-layout-placeholder {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.home-layout-placeholder__bar {
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--glass-border-soft);
  color: var(--color-gray-text);
}

.home-layout-placeholder__body {
  flex: 1;
  min-height: 0;
}
</style>
