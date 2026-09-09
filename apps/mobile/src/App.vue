<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showDialog } from "vant";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { onAction } from "@tauri-apps/plugin-notification";
import BottomNav from "@/components/BottomNav/index.vue";
import QuicStatusBar from "@/components/QuicStatusBar/index.vue";
import ReconnectOverlay from "@/components/ReconnectOverlay/index.vue";
import SyncOverlay from "@/components/SyncOverlay/index.vue";
import { startQuicMonitor, stopQuicMonitor } from "@/stores/quic";
import {
  startUnreadMonitor,
  stopUnreadMonitor,
  useUnreadStore,
} from "@/stores/unread";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { useCallManager } from "@/webrtc/callManager";
import { clearUuidCache } from "@/utils/api";
import AnnouncementCenter from "@/components/AnnouncementCenter.vue";

const route = useRoute();
const router = useRouter();
const { isLoggedIn, clearAuth } = useAuthStore();
useTheme();
useCallManager();

let unlistenForceLogout: UnlistenFn | undefined;
let logoutTask: Promise<void> | undefined;

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

const setForeground = (value: "1" | "0") => {
  invoke("add_user_map", { map: { app_foreground: value } }).catch(() => {
    // 纯浏览器/开发环境无 Tauri，忽略
  });
};

/** 从通知点击回传数据中解析出会话目标（Rust 端 extra.payload.chat） */
const readChatTarget = (raw: unknown): { is_group: boolean; target: string } | null => {
  const get = (obj: unknown): unknown =>
    typeof obj === "string"
      ? (() => {
          try {
            return JSON.parse(obj);
          } catch {
            return obj;
          }
        })()
      : obj;

  const action = get(raw) as Record<string, unknown>;
  const notification = get(action?.notification) as Record<string, unknown>;
  const extra = get(notification?.extra) as Record<string, unknown>;
  const payload = get(extra?.payload) as Record<string, unknown>;
  const chat = get(payload?.chat ?? extra?.chat) as Record<string, unknown>;
  if (typeof chat?.target === "string" && chat.target) {
    return { is_group: chat.is_group === true, target: chat.target };
  }
  return null;
};

const registerNotificationClick = async () => {
  try {
    await onAction((notification) => {
      const raw = notification as unknown as Record<string, unknown>;
      // 只有"点击通知主体"才跳转；操作按钮(回复等)暂不处理
      if (raw.actionId !== "tap") return;
      const chat = readChatTarget(raw);
      if (!chat) return;
      const path = chat.is_group
        ? `/chats/group-chat/${encodeURIComponent(chat.target)}`
        : `/chats/chat/${encodeURIComponent(chat.target)}`;
      if (route.path !== path) {
        router.push(path);
      }
    });
  } catch (e) {
    console.error("通知点击监听注册失败:", e);
  }
};

const setupForegroundTracking = () => {
  setForeground("1");
  const onVisibility = () => {
    const visible = document.visibilityState === "visible";
    setForeground(visible ? "1" : "0");
    if (visible) {
      useUnreadStore().refresh().catch(console.error);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", () => {
    setForeground("1");
    useUnreadStore().refresh().catch(console.error);
  });
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", () => setForeground("1"));
  };
};

// 登录状态驱动后台监听生命周期：
// - 登出/被踢下线 → 调 Rust 统一会话清理(logout: 停QUIC/定时任务/媒体/池)并停止本地轮询监听
// - 重新登录 → 重启监听(monitor 内部有防重入守卫)
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    startQuicMonitor();
    startUnreadMonitor();
    return;
  }
  if (logoutTask) return;
  logoutTask = (async () => {
    try {
      await invoke("logout");
    } catch (e) {
      console.error("Rust 会话清理失败:", e);
    }
    stopUnreadMonitor();
    stopQuicMonitor();
    clearUuidCache();
  })();
  logoutTask
    .finally(() => {
      logoutTask = undefined;
    })
    .catch(() => {});
});

onMounted(() => {
  startQuicMonitor();
  startUnreadMonitor();
  registerNotificationClick();
  setupForegroundTracking();
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
  stopUnreadMonitor();
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
    <AnnouncementCenter />
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
