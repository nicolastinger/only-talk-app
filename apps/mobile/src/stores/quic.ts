import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type ConnectionState = "idle" | "connected" | "disconnected";
type StatusTagState = "offline" | "reconnecting" | "online";

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟
const STATUS_TAG_ONLINE_MS = 3 * 1000; // 已上线标签展示时长

const state = reactive({
  isConnected: true,
  connectionState: "idle" as ConnectionState,
  message: "",
  isSyncing: false,
  reconnecting: false,
  statusTag: null as StatusTagState | null,
});

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let statusTagTimer: ReturnType<typeof setTimeout> | null = null;
let wasConnected = true;
let unlisteners: UnlistenFn[] = [];
let monitorStarted = false;

const clearSyncTimer = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
};

const clearStatusTagTimer = () => {
  if (statusTagTimer) {
    clearTimeout(statusTagTimer);
    statusTagTimer = null;
  }
};

const showStatusTag = (statusTag: StatusTagState) => {
  clearStatusTagTimer();
  state.statusTag = statusTag;
  if (statusTag === "online") {
    // 已上线标签 3s 后自动关闭
    statusTagTimer = setTimeout(() => {
      state.statusTag = null;
    }, STATUS_TAG_ONLINE_MS);
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
      // 首次断连显示"已离线"；重复广播不降级(重连中不回退)
      if (wasConnected) {
        wasConnected = false;
        showStatusTag("offline");
      }
    })
  );
  unlisteners.push(
    await listen<string>("quic_connected", () => {
      markConnected();
      wasConnected = true;
      showStatusTag("online");
    })
  );
  unlisteners.push(
    await listen<string>("quic_reconnecting", () => {
      showStatusTag("reconnecting");
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
      // 连接是否成功以 quic_connected 事件为准，不在此乐观置为已连接
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
  clearStatusTagTimer();
  state.statusTag = null;
  monitorStarted = false;
}
