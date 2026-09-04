/**
 * WebRTC 信令协议（与 PC 端对齐）
 *
 * 控制消息 text_type：
 *   12 = 通话邀请(invite)   13 = 接受(accept)   14 = 拒绝(reject)
 *   均通过普通私聊通道 invoke('send_text_msg') 发送（走 QUIC）。
 * 信令消息 text_type：
 *   100 = WebRTC 信令(offer/answer/candidate/end)
 *   通过 invoke('send_webrtc_signal') 发送，服务端仅转发不持久化。
 *
 * 通话类型：invite/accept 附带可选字段 media:"audio"|"video"，
 *   PC 端解析忽略多余字段，故跨端时自动按视频通话处理。
 */
import { invoke } from "@tauri-apps/api/core";

/** 通话控制消息类型 */
export const MSG_TYPE_VIDEO_CALL_INVITE = 12;
export const MSG_TYPE_VIDEO_CALL_ACCEPT = 13;
export const MSG_TYPE_VIDEO_CALL_REJECT = 14;
/** WebRTC 信令消息类型 */
export const MSG_TYPE_WEBRTC_SIGNAL = 100;

export type CallMediaType = "audio" | "video";
export type SignalType = "offer" | "answer" | "candidate" | "end";
export type ControlType = "invite" | "accept" | "reject";

/** 外层消息体结构（TextQuicMsgVo 前端镜像） */
export interface TextQuicMsgVoLike {
  nano_id: string;
  text_type: number;
  raw: string;
  recv_user: string;
  send_user: string;
  timestamp: number;
}

/** 控制消息 raw 解析结果 */
export interface ControlPayload {
  type: ControlType | string;
  sender: string;
  receiver: string;
  sessionId: string;
  timestamp: number;
  media?: CallMediaType;
}

/** 信令消息 raw 解析结果 */
export interface SignalPayload {
  type: SignalType;
  sender: string;
  receiver: string;
  sessionId: string;
  data?: any;
  timestamp: number;
}

/** 生成消息唯一 ID（与 Chat 页 21 位随机串一致，避免引入 nanoid 依赖） */
export const genId = (): string => {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
  return Array.from({ length: 21 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
};

/** 解析外层文本消息 */
export const parseTextQuicMsg = (payload: string): TextQuicMsgVoLike | null => {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

/** 解析控制消息 raw（12/13/14） */
export const parseControl = (raw: string): ControlPayload | null => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 解析信令消息 raw（100） */
export const parseSignal = (raw: string): SignalPayload | null => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 发送控制消息（12/13/14），走普通私聊通道 */
export const sendControlMsg = async (params: {
  textType: number;
  type: ControlType;
  sender: string;
  receiver: string;
  sessionId: string;
  media?: CallMediaType;
}): Promise<void> => {
  const { textType, type, sender, receiver, sessionId, media } = params;
  const msg: TextQuicMsgVoLike = {
    nano_id: genId(),
    text_type: textType,
    raw: JSON.stringify({
      type,
      sender,
      receiver,
      sessionId,
      timestamp: Date.now(),
      ...(media ? { media } : {}),
    }),
    recv_user: receiver,
    send_user: sender,
    timestamp: Date.now(),
  };
  await invoke("send_text_msg", { textQuicMsg: msg });
};

/** 发送 WebRTC 信令（100 offer/answer/candidate/end），独立信令通道 */
export const sendWebRTCSignal = async (params: {
  type: SignalType;
  sender: string;
  receiver: string;
  sessionId: string;
  data?: any;
}): Promise<void> => {
  const { type, sender, receiver, sessionId, data } = params;
  const msg: TextQuicMsgVoLike = {
    nano_id: genId(),
    text_type: MSG_TYPE_WEBRTC_SIGNAL,
    raw: JSON.stringify({
      type,
      sender,
      receiver,
      sessionId,
      ...(data !== undefined ? { data } : {}),
      timestamp: Date.now(),
    }),
    recv_user: receiver,
    send_user: sender,
    timestamp: Date.now(),
  };
  await invoke("send_webrtc_signal", { textQuicMsg: msg });
};
