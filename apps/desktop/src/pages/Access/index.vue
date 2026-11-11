<script setup lang="ts">
import { computed } from 'vue';

// 本地权限条件：迁移期不依赖 Umi Access
const canSeeAdmin = computed(() => true);
</script>

<template>
  <div class="access-page">
    <h2 class="access-title">权限示例</h2>
    <div v-if="canSeeAdmin">
      <a-button>只有 Admin 可以看到这个按钮</a-button>
      <div></div>
    </div>
  </div>
</template>

<style scoped>
.access-page {
  padding: 24px;
}

.access-title {
  margin-bottom: 16px;
  font-size: 20px;
  font-weight: 600;
}
</style>
