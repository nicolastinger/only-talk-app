<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="chats-layout-placeholder">
    <div class="chats-layout-placeholder__side">
      ChatsLayout 迁移中：{{ route.fullPath }}
    </div>
    <div class="chats-layout-placeholder__main">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.chats-layout-placeholder {
  display: flex;
  height: 100%;
}

.chats-layout-placeholder__side {
  flex: 0 0 280px;
  padding: 12px;
  border-right: 1px solid var(--glass-border-soft);
  color: var(--color-gray-text);
}

.chats-layout-placeholder__main {
  flex: 1;
  min-width: 0;
}
</style>
