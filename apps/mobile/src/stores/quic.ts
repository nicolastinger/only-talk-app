import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type ConnectionState = "idle" | "connected" | "disconnected";

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟

const state = reactive({
  isConnected: true,
  connectionState: "idle" as ConnectionState,
  message: "",
  isSyncing: false,
  reconnecting: false,
});

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let unlisteners: UnlistenFn[] = [];
let monitorStarted = false;

const clearSyncTimer = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
};

const markConnected = () => {
  state.isConnected = true;
  state.connectionState = "connected";
  state.message = "";
};

const registerListeners = async () => {
  unlisteners.push(
    await listen<string>("quic_disconnected", (event) => {
      state.isConnected = false;
      state.connectionState = "disconnected";
      state.message = event.payload || "QUIC连接已断开";
    })
  );
  unlisteners.push(
    await listen<string>("quic_connected", () => {
      markConnected();
    })
  );
  unlisteners.push(
    await listen<string>("quic_sync_start", () => {
      state.isSyncing = true;
      clearSyncTimer();
      syncTimer = setTimeout(() => {
        state.isSyncing = false;
      }, SYNC_TIMEOUT_MS);
    })
  );
  unlisteners.push(
    await listen<string>("quic_sync_complete", () => {
      clearSyncTimer();
      state.isSyncing = false;
    })
  );
};

export const useQuicStore = () => ({
  state,
  async reconnect() {
    if (state.reconnecting) return;
    state.reconnecting = true;
    try {
      await invoke("reconnect_quic_command");
      markConnected();
    } catch (e) {
      console.error("QUIC 重连失败:", e);
    } finally {
      state.reconnecting = false;
    }
  },
});

export function startQuicMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  registerListeners().catch((e) => {
    console.error("QUIC 连接监控初始化失败", e);
  });
}

export function stopQuicMonitor() {
  unlisteners.forEach((fn) => fn());
  unlisteners = [];
  clearSyncTimer();
  monitorStarted = false;
}
