<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import BottomNav from "@/components/BottomNav/index.vue";

const route = useRoute();

const showNav = computed(() => {
  const path = route.path;
  if (path.startsWith("/chats/chat/")) return false;
  if (path === "/friends/search" || path.startsWith("/friends/detail/")) return false;
  return ["/chats", "/friends", "/moments", "/profile"].includes(path);
});
</script>

<template>
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <BottomNav v-if="showNav" />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #e8f4fd;
  color: var(--text-primary, #1a2a3a);
}

#app {
  min-height: 100vh;
}
</style>

<style scoped lang="less">
.app-container {
  min-height: 100vh;
  background: var(--page-bg, linear-gradient(180deg, #e8f4fd 0%, #f0f6ff 30%, #ffffff 100%));
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
