/**
 * 移动端 WebRTC 通话编排管理器（单窗口单例）
 *
 * 职责（对应 PC 端 useWebRTCIncomingCall + useWebRTCCall，但适配单窗口 SPA）：
 * - 全局监听 text_message(12 邀请 / 13 接受 / 14 拒绝) 与 webrtc_signal(100 信令)
 * - 管理一次通话的全部状态（阶段/媒体/连接）
 * - 提供 发起/接听/拒绝/挂断/开关/切摄像头/重试 动作
 *
 * 页面（/call）只负责渲染：通过 useCallManager() 取状态与动作。
 */
import { reactive, ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { showToast } from "vant";
import { WebRTCService } from "./WebRTCService";
import {
  parseControl,
  parseSignal,
  parseTextQuicMsg,
  sendControlMsg,
  sendWebRTCSignal,
  MSG_TYPE_VIDEO_CALL_ACCEPT,
  MSG_TYPE_VIDEO_CALL_REJECT,
  type CallMediaType,
} from "./signal";
import { getMyUuid } from "@/utils/api";
import router from "@/router";

export type CallStage =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "ended"
  | "rejected"
  | "failed";
export type CallRole = "initiator" | "responder";

interface CallState {
  active: boolean;
  stage: CallStage;
  role: CallRole;
  media: CallMediaType;
  friendId: string;
  sessionId: string;
  videoOn: boolean;
  audioOn: boolean;
  connStatus: "connecting" | "connected" | "disconnected" | "failed";
  elapsedSec: number;
  errorMsg: string;
}

const call = reactive<CallState>({
  active: false,
  stage: "idle",
  role: "initiator",
  media: "video",
  friendId: "",
  sessionId: "",
  videoOn: true,
  audioOn: true,
  connStatus: "connecting",
  elapsedSec: 0,
  errorMsg: "",
});

// MediaStream 不能放入 reactive/ref 深代理，单独用 ref 存储原始对象
const localStream = ref<MediaStream | null>(null);
const remoteStream = ref<MediaStream | null>(null);

let service: WebRTCService | null = null;
let meUuid = "";
let meLoaded = false;
let installed = false;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let noAnswerTimer: ReturnType<typeof setTimeout> | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let exitTimer: ReturnType<typeof setTimeout> | null = null;

const RING_TIMEOUT_MS = 45_000;

const ensureMe = async (): Promise<string> => {
  if (!meLoaded) {
    meUuid = (await getMyUuid().catch(() => "")) || "";
    meLoaded = true;
  }
  return meUuid;
};

const clearTimers = () => {
  if (ringTimer) clearTimeout(ringTimer);
  if (noAnswerTimer) clearTimeout(noAnswerTimer);
  if (elapsedTimer) clearInterval(elapsedTimer);
  if (exitTimer) clearTimeout(exitTimer);
  ringTimer = noAnswerTimer = elapsedTimer = exitTimer = null;
};

const startElapsedTimer = () => {
  if (elapsedTimer) clearInterval(elapsedTimer);
  call.elapsedSec = 0;
  elapsedTimer = setInterval(() => {
    call.elapsedSec += 1;
  }, 1000);
};

const isMidCall = () =>
  call.active &&
  ["outgoing", "incoming", "connecting", "connected"].includes(call.stage);

/** 绑定服务回调（远程流 / 连接状态） */
const attachServiceCallbacks = (svc: WebRTCService, friendId: string) => {
  svc.setOnRemoteStreamCallback((fromId, stream) => {
    if (fromId === friendId) remoteStream.value = stream;
  });
  svc.setOnConnectionStateChange((fromId, state) => {
    if (fromId !== friendId) return;
    if (state === "connected") {
      call.connStatus = "connected";
      if (call.stage === "connecting") {
        call.stage = "connected";
        startElapsedTimer();
      }
    } else if (state === "disconnected") {
      call.connStatus = "disconnected";
    } else if (state === "closed") {
      // 本端主动关闭，无需处理
    } else if (state === "failed") {
      call.connStatus = "failed";
      if (call.stage === "connecting" || call.stage === "connected") {
        call.stage = "failed";
        call.errorMsg = "连接失败，请重试或挂断";
      }
    }
  });
};

const getOrCreateService = (): WebRTCService => {
  if (!service) service = new WebRTCService();
  return service;
};

/** 挂断后统一退出到上一页（终端态短暂展示后触发） */
const exitCall = (delay = 1600) => {
  clearTimers();
  if (exitTimer) clearTimeout(exitTimer);
  exitTimer = setTimeout(() => {
    reset();
    router.back();
  }, delay);
};

const reset = () => {
  clearTimers();
  if (service) {
    service.closeAllConnections();
    service = null;
  }
  localStream.value = null;
  remoteStream.value = null;
  call.active = false;
  call.stage = "idle";
  call.role = "initiator";
  call.media = "video";
  call.friendId = "";
  call.sessionId = "";
  call.videoOn = true;
  call.audioOn = true;
  call.connStatus = "connecting";
  call.elapsedSec = 0;
  call.errorMsg = "";
};

/** 本地媒体初始化（失败降级：无流继续，视频失败提示可仅语音） */
const setupLocalMedia = async (wantVideo: boolean) => {
  try {
    const stream = await service!.initLocalStream(wantVideo, true);
    localStream.value = stream;
  } catch (e) {
    console.error("[CallManager] 初始化本地媒体流失败:", e);
    localStream.value = null;
    if (wantVideo) {
      call.videoOn = false;
      showToast("无法访问摄像头/麦克风，本次可能仅语音");
    } else {
      showToast("无法访问麦克风");
    }
  }
};

/** 远端挂断/取消后的收尾 */
const handleRemoteEnd = () => {
  if (!call.active) return;
  service?.closeConnection(call.friendId);
  service?.closeLocalStream();
  localStream.value = null;
  remoteStream.value = null;
  call.stage = "ended";
  call.errorMsg = "对方已挂断";
  exitCall();
};

/* ========================= 信令接收 ========================= */

const onTextMessage = async (payload: string) => {
  const msg = parseTextQuicMsg(payload);
  if (!msg) return;
  const me = await ensureMe();
  if (!me || msg.recv_user !== me) return;

  if (msg.text_type !== 12 && msg.text_type !== 13 && msg.text_type !== 14) {
    return;
  }
  const ctrl = parseControl(msg.raw);
  if (!ctrl || !ctrl.sessionId) return;
  const friendId = msg.send_user;

  if (msg.text_type === 12 && ctrl.type === "invite") {
    // 忙碌：已有活跃通话则自动拒绝新的邀请
    if (isMidCall()) {
      console.log("[CallManager] 通话中，自动拒绝新邀请");
      sendControlMsg({
        textType: MSG_TYPE_VIDEO_CALL_REJECT,
        type: "reject",
        sender: me,
        receiver: friendId,
        sessionId: ctrl.sessionId,
      }).catch(() => {});
      return;
    }
    beginIncoming(friendId, ctrl.sessionId, ctrl.media);
    return;
  }

  if (!isMidCall() || friendId !== call.friendId) return;

  if (msg.text_type === 13 && ctrl.type === "accept" && call.role === "initiator") {
    // 对方接受 → 发起方创建并发送 offer
    if (call.stage === "outgoing") {
      if (noAnswerTimer) clearTimeout(noAnswerTimer);
      noAnswerTimer = null;
      try {
        const offer = await service!.createOffer(friendId);
        await sendWebRTCSignal({
          type: "offer",
          sender: me,
          receiver: friendId,
          sessionId: call.sessionId,
          data: offer,
        });
        call.stage = "connecting";
      } catch (e) {
        console.error("[CallManager] 创建 offer 失败:", e);
        call.errorMsg = "连接建立失败";
        call.stage = "failed";
      }
    }
    return;
  }

  if (msg.text_type === 14 && ctrl.type === "reject") {
    if (call.role === "initiator" && call.stage === "outgoing") {
      call.stage = "rejected";
      call.errorMsg = "对方已拒绝";
      exitCall();
    } else if (call.stage === "incoming") {
      // 发起方取消：不再响铃
      call.stage = "rejected";
      call.errorMsg = "对方已取消";
      exitCall();
    }
  }
};

const onWebRTCSignal = async (payload: string) => {
  const msg = parseTextQuicMsg(payload);
  if (!msg) return;
  const sig = parseSignal(msg.raw);
  if (!sig) return;
  const me = await ensureMe();
  if (!me || !call.active) return;
  if (sig.sender !== call.friendId) return;
  if (call.sessionId && sig.sessionId && sig.sessionId !== call.sessionId) {
    console.warn("[CallManager] 忽略旧会话信令:", sig.sessionId);
    return;
  }

  const friendId = call.friendId;
  switch (sig.type) {
    case "offer": {
      // 响应方收到 offer（主叫接受后的正常 offer 或 ICE 重启）
      if (call.role !== "responder") return;
      try {
        const answer = await service!.handleOffer(friendId, sig.data);
        await sendWebRTCSignal({
          type: "answer",
          sender: me,
          receiver: friendId,
          sessionId: call.sessionId,
          data: answer,
        });
      } catch (e) {
        console.error("[CallManager] 处理 offer/answer 失败:", e);
      }
      break;
    }
    case "answer": {
      if (call.role !== "initiator") return;
      try {
        await service!.handleAnswer(friendId, sig.data);
      } catch (e) {
        console.error("[CallManager] 处理 answer 失败:", e);
      }
      break;
    }
    case "candidate": {
      try {
        await service!.handleCandidate(friendId, sig.data);
      } catch (e) {
        console.error("[CallManager] 处理 candidate 失败:", e);
      }
      break;
    }
    case "end": {
      handleRemoteEnd();
      break;
    }
  }
};

/* ========================= 动作 ========================= */

const beginIncoming = (
  friendId: string,
  sessionId: string,
  media?: CallMediaType
) => {
  const svc = getOrCreateService();
  svc.sessionId = sessionId;
  call.active = true;
  call.role = "responder";
  call.media = media === "audio" ? "audio" : "video";
  call.friendId = friendId;
  call.sessionId = sessionId;
  call.videoOn = call.media === "video";
  call.audioOn = true;
  call.stage = "incoming";
  call.connStatus = "connecting";
  call.elapsedSec = 0;
  call.errorMsg = "";
  attachServiceCallbacks(svc, friendId);

  // 无人接听 45s 自动拒绝
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = setTimeout(async () => {
    if (call.stage === "incoming") {
      const me = await ensureMe();
      if (me && call.active) {
        sendControlMsg({
          textType: MSG_TYPE_VIDEO_CALL_REJECT,
          type: "reject",
          sender: me,
          receiver: call.friendId,
          sessionId: call.sessionId,
        }).catch(() => {});
      }
      call.stage = "rejected";
      call.errorMsg = "未接听";
      exitCall();
    }
  }, RING_TIMEOUT_MS);

  router.push("/call");
};

/** 发起通话（返回是否成功进入） */
const startCall = async (
  friendId: string,
  media: CallMediaType
): Promise<boolean> => {
  if (isMidCall()) {
    showToast("正在通话中");
    return false;
  }
  const me = await ensureMe();
  if (!me) {
    showToast("未登录");
    return false;
  }
  reset();
  meUuid = me;

  const svc = getOrCreateService();
  call.active = true;
  call.role = "initiator";
  call.media = media;
  call.friendId = friendId;
  call.sessionId = svc.sessionId;
  call.videoOn = media === "video";
  call.audioOn = true;
  call.stage = "outgoing";
  call.connStatus = "connecting";
  call.elapsedSec = 0;
  call.errorMsg = "";
  attachServiceCallbacks(svc, friendId);

  await setupLocalMedia(media === "video");

  sendControlMsg({
    textType: 12,
    type: "invite",
    sender: me,
    receiver: friendId,
    sessionId: call.sessionId,
    media,
  }).catch((e) => {
    console.error("[CallManager] 发送邀请失败:", e);
    showToast("通话请求发送失败");
  });

  // 45s 无人应答自动结束
  if (noAnswerTimer) clearTimeout(noAnswerTimer);
  noAnswerTimer = setTimeout(() => {
    if (call.stage === "outgoing") {
      call.stage = "ended";
      call.errorMsg = "对方无应答";
      service?.closeConnection(call.friendId);
      service?.closeLocalStream();
      exitCall();
    }
  }, RING_TIMEOUT_MS);

  router.push("/call");
  return true;
};

/** 接听（响应方） */
const accept = async () => {
  if (!isMidCall() || call.role !== "responder" || call.stage !== "incoming") {
    return;
  }
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  call.stage = "connecting";
  await setupLocalMedia(call.media === "video");
  const me = await ensureMe();
  await sendControlMsg({
    textType: MSG_TYPE_VIDEO_CALL_ACCEPT,
    type: "accept",
    sender: me,
    receiver: call.friendId,
    sessionId: call.sessionId,
    media: call.media,
  }).catch((e) => console.error("[CallManager] 发送接受失败:", e));
};

/** 拒绝（响应方） */
const decline = async () => {
  if (!call.active || call.stage !== "incoming") return;
  const me = await ensureMe();
  await sendControlMsg({
    textType: MSG_TYPE_VIDEO_CALL_REJECT,
    type: "reject",
    sender: me,
    receiver: call.friendId,
    sessionId: call.sessionId,
  }).catch(() => {});
  reset();
  router.back();
};

/** 挂断（发起方取消/任意一方挂断） */
const hangup = async () => {
  if (!call.active) return;
  const me = await ensureMe();
  const notifyPeer =
    call.stage === "connecting" ||
    call.stage === "connected" ||
    call.stage === "outgoing" ||
    call.stage === "failed";
  if (notifyPeer) {
    try {
      await sendWebRTCSignal({
        type: "end",
        sender: me,
        receiver: call.friendId,
        sessionId: call.sessionId,
      });
    } catch (e) {
      console.error("[CallManager] 发送结束信令失败:", e);
    }
  }
  reset();
  router.back();
};

/** 重试（failed 状态） */
const retry = async () => {
  if (!call.active || call.stage !== "failed") return;
  call.stage = call.role === "initiator" ? "outgoing" : "connecting";
  call.connStatus = "connecting";
  call.errorMsg = "";
  try {
    service?.closeConnection(call.friendId);
    if (call.role === "initiator") {
      const me = await ensureMe();
      const offer = await service!.createOffer(call.friendId);
      await sendWebRTCSignal({
        type: "offer",
        sender: me,
        receiver: call.friendId,
        sessionId: call.sessionId,
        data: offer,
      });
      call.stage = "connecting";
    } else {
      // 响应方等待主叫重新发 offer
      call.stage = "connecting";
    }
  } catch (e) {
    console.error("[CallManager] 重试失败:", e);
    call.stage = "failed";
  }
};

const toggleAudio = () => {
  if (!service) return false;
  const on = service.toggleAudio();
  call.audioOn = on;
  return on;
};

const toggleVideo = () => {
  if (!service) return false;
  const on = service.toggleVideo();
  call.videoOn = on;
  return on;
};

const switchCamera = async () => {
  try {
    await service?.switchCamera();
  } catch (e) {
    console.error("[CallManager] 切换摄像头失败:", e);
    showToast("切换摄像头失败");
  }
};

/* ========================= 全局监听 ========================= */

const installGlobalListeners = async () => {
  if (installed) return;
  installed = true;
  try {
    await listen<string>("text_message", (event) => {
      onTextMessage(event.payload).catch((e) =>
        console.error("[CallManager] text_message 处理失败:", e)
      );
    });
    await listen<string>("webrtc_signal", (event) => {
      onWebRTCSignal(event.payload).catch((e) =>
        console.error("[CallManager] webrtc_signal 处理失败:", e)
      );
    });
  } catch (e) {
    console.error("[CallManager] 安装全局监听失败:", e);
    installed = false;
  }
};

/** 供 /call 页面与 App 使用：单例状态 + 动作 */
export const useCallManager = () => {
  installGlobalListeners();
  return {
    call,
    localStream,
    remoteStream,
    startCall,
    accept,
    decline,
    hangup,
    retry,
    toggleAudio,
    toggleVideo,
    switchCamera,
    reset,
  };
};
