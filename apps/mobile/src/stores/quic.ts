import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type ConnectionState = "idle" | "connected" | "disconnected";

const SYNC_TIMEOUT_MS = 3 * 60 * 1000; // 3 分钟
// 断线重连遮罩最长显示时长：Rust 端每 5s 自动重连一次，
// 超过该时长仍未连上则收起遮罩、回退到顶部横幅（后台继续自动重连）
const RECONNECT_MASK_TIMEOUT_MS = 20 * 1000; // 20 秒

const state = reactive({
  isConnected: true,
  connectionState: "idle" as ConnectionState,
  message: "",
  isSyncing: false,
  reconnecting: false,
  // 断线重连期间的全屏遮罩（阻止用户误操作，重连成功或超时后收起）
  reconnectMaskVisible: false,
});

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let maskTimer: ReturnType<typeof setTimeout> | null = null;
let unlisteners: UnlistenFn[] = [];
let monitorStarted = false;

const clearSyncTimer = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
};

const clearMaskTimer = () => {
  if (maskTimer) {
    clearTimeout(maskTimer);
    maskTimer = null;
  }
};

const markConnected = () => {
  state.isConnected = true;
  state.connectionState = "connected";
  state.message = "";
};

// 显示重连遮罩并启动超时：超时未连上则收起遮罩，让位给顶部横幅
const showReconnectMask = () => {
  clearMaskTimer();
  state.reconnectMaskVisible = true;
  maskTimer = setTimeout(() => {
    state.reconnectMaskVisible = false;
  }, RECONNECT_MASK_TIMEOUT_MS);
};

const hideReconnectMask = () => {
  clearMaskTimer();
  state.reconnectMaskVisible = false;
};

const registerListeners = async () => {
  unlisteners.push(
    await listen<string>("quic_disconnected", (event) => {
      // 仅当从已连接态跌落时才开启一轮遮罩计时；
      // 断开期间 Rust 每 3s 广播一次，重复广播不能重置计时
      const droppedFromConnected = state.connectionState === "connected";
      state.isConnected = false;
      state.connectionState = "disconnected";
      state.message = event.payload || "QUIC连接已断开";
      if (droppedFromConnected) {
        showReconnectMask();
      }
    })
  );
  unlisteners.push(
    await listen<string>("quic_connected", () => {
      markConnected();
      hideReconnectMask();
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
    // 手动重连同样进入遮罩阶段，直到 quic_connected / 超时
    showReconnectMask();
    try {
      await invoke("reconnect_quic_command");
      // 连接是否成功以 quic_connected 事件或遮罩超时为准，不在此乐观置为已连接
    } catch (e) {
      console.error("QUIC 重连失败:", e);
      hideReconnectMask();
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
  clearMaskTimer();
  state.reconnectMaskVisible = false;
  monitorStarted = false;
}
