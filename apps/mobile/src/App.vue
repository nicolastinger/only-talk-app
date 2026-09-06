<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showDialog } from "vant";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import BottomNav from "@/components/BottomNav/index.vue";
import QuicStatusBar from "@/components/QuicStatusBar/index.vue";
import ReconnectOverlay from "@/components/ReconnectOverlay/index.vue";
import SyncOverlay from "@/components/SyncOverlay/index.vue";
import { startQuicMonitor, stopQuicMonitor } from "@/stores/quic";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { useCallManager } from "@/webrtc/callManager";

const route = useRoute();
const router = useRouter();
const { clearAuth } = useAuthStore();
useTheme();
useCallManager();

let unlistenForceLogout: UnlistenFn | undefined;

const showNav = computed(() => {
  const path = route.path;
  if (path === "/call") return false;
  if (path.startsWith("/chats/chat/")) return false;
  if (path === "/friends/search" || path.startsWith("/friends/detail/"))
    return false;
  if (path === "/friends/requests" || path === "/friends/group-requests")
    return false;
  if (path.startsWith("/plaza/moment/")) return false;
  return ["/chats", "/friends", "/plaza", "/profile"].includes(path);
});

onMounted(() => {
  startQuicMonitor();
  // 收到服务端"账号已在其他设备登录"通知:弹窗确认后再退出登录
  listen<string>("force_logout", (event) => {
    const reason =
      event.payload ||
      "您的账号已在其他设备登录，本机已被强制下线。";
    showDialog({
      title: "账号已在其他设备登录",
      message: reason,
      showCancelButton: false,
      confirmButtonText: "退出登录",
      confirmButtonColor: "#ef4444",
      closeOnClickOverlay: false,
    })
      .then(() => {
        clearAuth();
        router.replace("/login");
      })
      .catch(() => {});
  })
    .then((stop) => {
      unlistenForceLogout = stop;
    })
    .catch((e) => {
      console.error("force_logout 监听失败:", e);
    });
});

onUnmounted(() => {
  unlistenForceLogout?.();
  stopQuicMonitor();
});
</script>

<template>
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <transition name="page-slide" mode="default">
        <component :is="Component" />
      </transition>
    </router-view>
    <BottomNav v-if="showNav" />
    <QuicStatusBar />
    <ReconnectOverlay />
    <SyncOverlay />
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
  background: var(--bg-color);
  color: var(--text-primary);
}

#app {
  min-height: 100vh;
}
</style>

<style scoped lang="less">
.app-container {
  min-height: 100vh;
  background: var(
    --page-bg,
    linear-gradient(180deg, #e8f4fd 0%, #f0f6ff 30%, #ffffff 100%)
  );
}

.page-slide-enter-active {
  transition: opacity 0.1s ease;
}
.page-slide-leave-active {
  transition: opacity 0.08s ease;
}
.page-slide-enter-from {
  opacity: 0;
}
.page-slide-leave-to {
  opacity: 0;
}
</style>
