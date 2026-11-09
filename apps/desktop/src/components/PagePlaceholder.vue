<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => route.meta.title || route.path);
</script>

<template>
  <div class="page-placeholder">
    <h2>{{ title }}</h2>
    <p>页面迁移中：{{ route.fullPath }}</p>
  </div>
</template>

<style scoped>
.page-placeholder {
  display: flex;
  height: 100%;
  min-height: 200px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-gray-text);
}
</style>
