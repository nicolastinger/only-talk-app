<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="plaza-layout-placeholder">
    PlazaLayout 迁移中：{{ route.fullPath }}
  </div>
</template>

<style scoped>
.plaza-layout-placeholder {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: var(--color-gray-text);
}
</style>
