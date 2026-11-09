<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => route.meta.title || route.path);
</script>

<template>
  <div class="nested-placeholder">
    <div class="nested-placeholder__bar">布局迁移中：{{ title }}</div>
    <div class="nested-placeholder__body">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.nested-placeholder {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.nested-placeholder__bar {
  flex: 0 0 40px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--glass-border-soft);
  color: var(--color-gray-text);
}

.nested-placeholder__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
