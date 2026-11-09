<script setup lang="ts">
import FileSelectorTest from './components/FileSelectorTest.vue';
</script>

<template>
  <div class="test-component-page">
    <h2 class="test-component-title">组件测试</h2>
    <FileSelectorTest />
  </div>
</template>

<style scoped>
.test-component-page {
  padding: 24px;
}

.test-component-title {
  margin-bottom: 16px;
  font-size: 20px;
  font-weight: 600;
}
</style>
