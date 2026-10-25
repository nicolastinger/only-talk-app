/**
 * WebRTC P2P 直连聊天协议（PC / 移动端共用）
 *
 * 所有帧都是 JSON 字符串，通过 RTCDataChannel 传输，不经过服务器；
 * 消息只存在于两端内存，窗口关闭/通话结束即消失。
 *
 * 帧类型：
 * - hello: 通道打开后互报能力，对端据此决定是否发送已读回执
 * - msg:   文本消息（id 用于已读回执关联）
 * - read:  已读回执（批量）
 *
 * 兼容性：老版本客户端直接发纯文本，decode 时会包装成 legacy 的 msg 帧；
 * 老版本不认识 hello/read 帧，所以只有收到对方 hello 且声明 read 能力后才会发回执，
 * 避免把 JSON 当成消息气泡显示在对端。
 */

/** 帧标识，用于区分「协议帧」和旧版纯文本 */
export const P2P_CHAT_MARKER = "__ot";
/** 能力：支持已读回执 */
export const P2P_CHAT_CAP_READ = "read";

export interface P2PChatHelloFrame {
  __ot: 1;
  kind: "hello";
  caps: string[];
}

export interface P2PChatMessageFrame {
  __ot: 1;
  kind: "msg";
  id: string;
  text: string;
  ts: number;
  /** 由旧版纯文本包装而来（无 id/ts） */
  legacy?: boolean;
}

export interface P2PChatReadFrame {
  __ot: 1;
  kind: "read";
  ids: string[];
}

export type P2PChatFrame =
  | P2PChatHelloFrame
  | P2PChatMessageFrame
  | P2PChatReadFrame;

const encode = (frame: P2PChatFrame): string => JSON.stringify(frame);

export const encodeP2PChatHello = (caps: string[] = [P2P_CHAT_CAP_READ]): string =>
  encode({ __ot: 1, kind: "hello", caps });

export const encodeP2PChatMessage = (id: string, text: string): string =>
  encode({ __ot: 1, kind: "msg", id, text, ts: Date.now() });

export const encodeP2PChatRead = (ids: string[]): string =>
  encode({ __ot: 1, kind: "read", ids });

/** 解析收到的 DataChannel 数据；非协议帧按旧版纯文本消息处理 */
export const decodeP2PChatFrame = (raw: string): P2PChatFrame => {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  if (!text.startsWith(`{"${P2P_CHAT_MARKER}"`)) {
    return { __ot: 1, kind: "msg", id: "", text, ts: Date.now(), legacy: true };
  }
  try {
    const parsed = JSON.parse(text) as Partial<P2PChatFrame> & {
      __ot?: number;
    };
    if (parsed && parsed.__ot === 1) {
      if (parsed.kind === "hello" && Array.isArray(parsed.caps)) {
        return { __ot: 1, kind: "hello", caps: parsed.caps.map(String) };
      }
      if (parsed.kind === "read" && Array.isArray(parsed.ids)) {
        return { __ot: 1, kind: "read", ids: parsed.ids.map(String) };
      }
      if (parsed.kind === "msg" && typeof parsed.text === "string") {
        return {
          __ot: 1,
          kind: "msg",
          id: String(parsed.id || ""),
          text: parsed.text,
          ts: Number(parsed.ts) || Date.now(),
        };
      }
    }
  } catch {
    /* 解析失败按纯文本处理 */
  }
  return { __ot: 1, kind: "msg", id: "", text, ts: Date.now(), legacy: true };
};

/** 生成消息 id（不需要全局唯一，只用于两端关联回执） */
export const genP2PChatMessageId = (): string =>
  `p2p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
