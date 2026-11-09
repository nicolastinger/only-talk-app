<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="dev-assistant-placeholder">
    <span>Dev Assistant</span>
    <span>{{ route.fullPath }}</span>
  </div>
</template>

<style scoped>
.dev-assistant-placeholder {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  display: none;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--glass-bg);
  color: var(--color-gray-text);
  font-size: 12px;
}
</style>
