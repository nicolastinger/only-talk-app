/**
 * 移动端隐私模式（P2P QUIC）编排管理器（单例）。
 *
 * 与 PC 端同一套 Rust 能力：
 * - 发起: send_init_p2p_udp + send_p2p_init_msg
 * - 接收: listen_p2p_request(type 102) + process_init_p2p_request
 * - 就绪: p2p_ready(监听端已监听 / 连接端已连上) 后进入隐私聊天页
 * - 拒绝: listen_p2p_request(type 104)
 *
 * 注意：隐私文本走 send_p2p_text_msg / p2p_text_message，消息仅存内存，不落库。
 */
import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import { showToast } from "vant";
import { get_user_info_with_cache, subscribe } from "@workspace/services";
import type { P2pInitMsg, P2pMsg, UserInfo } from "@workspace/types";
import router from "@/router";
import { t } from "@/i18n";

export interface PrivacyState {
  /** 收到的隐私模式请求（非空时展示接受/拒绝弹窗） */
  incoming: P2pInitMsg | null;
  /** 请求方用户信息（用于弹窗展示昵称/头像） */
  incomingUser: UserInfo | null;
  /** 已发出请求/已接受，等待 P2P 就绪 */
  waiting: boolean;
  /** 当前隐私会话对端 */
  friendId: string;
}

const state = reactive<PrivacyState>({
  incoming: null,
  incomingUser: null,
  waiting: false,
  friendId: "",
});

let installed = false;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
const WAIT_TIMEOUT_MS = 30_000;

const clearWait = () => {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  state.waiting = false;
};

const startWaitTimeout = () => {
  if (waitTimer) clearTimeout(waitTimer);
  waitTimer = setTimeout(() => {
    if (!state.waiting) return;
    clearWait();
    showToast(t("privacyChat.noResponse"));
  }, WAIT_TIMEOUT_MS);
};

const loadIncomingUser = async (uuid: string) => {
  try {
    const result = await get_user_info_with_cache(uuid);
    // 期间可能已取消/替换，只有仍是同一个请求才写入
    if (state.incoming?.request_uuid === uuid) {
      state.incomingUser = result.user_info;
    }
  } catch {
    // 忽略：弹窗回退展示 uuid
  }
};

const navigateToChat = (friendId: string) => {
  if (!friendId) return;
  state.friendId = friendId;
  const current = router.currentRoute.value;
  if (current.name === "PrivacyChat" && current.params.friendId === friendId) {
    return;
  }
  router.push({ name: "PrivacyChat", params: { friendId } });
};

const onP2pRequest = (payload: string) => {
  let msg: P2pMsg;
  try {
    msg = JSON.parse(payload) as P2pMsg;
  } catch {
    return;
  }

  if (msg.type === 102) {
    try {
      const init = JSON.parse(msg.raw) as P2pInitMsg;
      state.incoming = init;
      state.incomingUser = null;
      void loadIncomingUser(init.request_uuid);
    } catch (e) {
      console.error("[Privacy] 解析 P2P 请求失败:", e);
    }
    return;
  }

  if (msg.type === 104) {
    clearWait();
    showToast(t("privacyChat.userRejected"));
  }
};

const installGlobalListeners = () => {
  if (installed) return;
  installed = true;

  subscribe("listen_p2p_request", onP2pRequest);

  // 传输就绪后再进页面，避免监听端尚未 bind / 连接端尚未建流时发送失败
  subscribe("p2p_ready", (friendId) => {
    clearWait();
    if (typeof friendId === "string" && friendId) {
      navigateToChat(friendId);
    }
  });
};

/** 发起隐私模式（在好友聊天页调用） */
const startPrivacyChat = async (friendId: string) => {
  if (!friendId) return;
  if (state.waiting) {
    showToast(t("privacyChat.requesting"));
    return;
  }
  try {
    await invoke("send_init_p2p_udp");
    await invoke("send_p2p_init_msg", { acceptUser: friendId });
    state.friendId = friendId;
    state.waiting = true;
    startWaitTimeout();
    showToast(t("privacyChat.requesting"));
  } catch (e) {
    console.error("[Privacy] 发起隐私模式失败:", e);
    clearWait();
    showToast(t("privacyChat.startFailed"));
  }
};

const respondIncoming = async (accept: boolean) => {
  const init = state.incoming;
  if (!init) return;
  try {
    await invoke("process_init_p2p_request", {
      // 保留 request_cert / request_ipv6 等全部字段
      p2pInitMsg: JSON.stringify({ ...init, accept }),
    });
    state.incoming = null;
    state.incomingUser = null;
    if (accept) {
      state.friendId = init.request_uuid;
      state.waiting = true;
      startWaitTimeout();
      showToast(t("privacyChat.requesting"));
    }
  } catch (e) {
    console.error("[Privacy] 处理隐私模式请求失败:", e);
    showToast(t("privacyChat.startFailed"));
  }
};

const acceptIncoming = () => respondIncoming(true);
const rejectIncoming = () => respondIncoming(false);

/** 供 App / 聊天页 / 弹窗使用：单例状态 + 动作 */
export const usePrivacyManager = () => {
  installGlobalListeners();
  return {
    state,
    startPrivacyChat,
    acceptIncoming,
    rejectIncoming,
  };
};
