<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="contacts-layout-placeholder">
    <div class="contacts-layout-placeholder__side">
      ContactsLayout 迁移中：{{ route.fullPath }}
    </div>
    <div class="contacts-layout-placeholder__main">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.contacts-layout-placeholder {
  display: flex;
  height: 100%;
}

.contacts-layout-placeholder__side {
  flex: 0 0 280px;
  padding: 12px;
  border-right: 1px solid var(--glass-border-soft);
  color: var(--color-gray-text);
}

.contacts-layout-placeholder__main {
  flex: 1;
  min-width: 0;
}
</style>
