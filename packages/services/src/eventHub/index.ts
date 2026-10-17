import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChatFileDownloadProgress,
  ChatFileUploadProgress,
} from "../fileService";
import type { UpdateDownloadProgress } from "../updateService";

/**
 * 后端经 `events::emit` 推送的全部事件名 -> payload 类型映射。
 * 新增后端事件时在此登记, 前端订阅即获得类型约束。
 */
export interface BackendEventPayloads {
  /** 私聊/群聊文本消息(JSON 字符串) */
  text_message: string;
  /** 群消息已读回执(JSON 字符串) */
  group_message_ack: string;
  /** 会话变更(新消息/已读等, JSON 字符串) */
  chat_session: string;
  /** 系统消息(JSON 字符串) */
  system_message: string;
  /** 新消息提醒弹条负载 */
  alert_incoming_message: string;
  /** 通知列表消息变更 */
  listen_notify_msg: string;
  /** 通知已读 */
  listen_notify_read: string;
  /** 好友列表变更(如 request_received) */
  friend_list_changed: string;
  /** 强制登出(携带原因) */
  force_logout: string;
  /** QUIC 连接建立 */
  quic_connected: string;
  /** QUIC 连接断开 */
  quic_disconnected: string;
  /** QUIC 重连中 */
  quic_reconnecting: string;
  /** 离线消息同步开始 */
  quic_sync_start: string;
  /** 离线消息同步完成 */
  quic_sync_complete: string;
  /** P2P 入站请求(JSON 字符串) */
  listen_p2p_request: string;
  /** 通话控制信令(JSON 字符串) */
  call_control: string;
  /** WebRTC 信令(JSON 字符串) */
  webrtc_signal: string;
  /** 视频通话邀请 */
  video_call_invite: string;
  /** 视频通话接听 */
  video_call_accept: string;
  /** 视频通话拒接 */
  video_call_reject: string;
  /** 视频通话结束 */
  video_call_end: string;
  /** 媒体协商配置(JSON 字符串) */
  media_config: string;
  /** 媒体控制指令(JSON 字符串) */
  media_control: string;
  /** 媒体元信息(JSON 字符串) */
  media_info: string;
  /** 媒体接收端就绪 */
  media_receiver_ready: string;
  /** P2P 文件分片数据(JSON 字符串) */
  p2p_file_data: string;
  /** P2P 文件传输请求 */
  p2p_file_transfer_request: string;
  /** P2P 文件传输响应 */
  p2p_file_transfer_response: string;
  /** P2P 文本消息 */
  p2p_text_message: string;
  /** 视频帧(原始字节数组) */
  video_frame: number[];
  /** 音频帧(原始字节数组) */
  audio_frame: number[];
  /** 聊天文件上传进度 */
  chat_file_upload_progress: ChatFileUploadProgress;
  /** 聊天文件下载进度 */
  chat_file_download_progress: ChatFileDownloadProgress;
  /** 更新包下载进度 */
  update_download_progress: UpdateDownloadProgress;
}

/** 后端事件名联合类型。 */
export type BackendEventName = keyof BackendEventPayloads;

/** 某后端事件的订阅回调类型。 */
export type BackendEventHandler<K extends BackendEventName> = (
  payload: BackendEventPayloads[K]
) => void;

type RawHandler = (payload: unknown) => void;

const handlers = new Map<BackendEventName, Set<RawHandler>>();
const pending = new Map<BackendEventName, Promise<UnlistenFn>>();

function dispatch(name: BackendEventName, payload: unknown): void {
  const set = handlers.get(name);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[eventHub] handler error for "${name}":`, error);
    }
  }
}

/**
 * 订阅后端事件(按事件名引用计数)。
 * 首个订阅者触发底层 `listen`, 最后一个退订者释放 `unlisten`。
 * @returns 取消本次订阅的函数
 */
export function subscribe<K extends BackendEventName>(
  name: K,
  handler: BackendEventHandler<K>
): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(handler as RawHandler);
  if (!pending.has(name)) {
    pending.set(
      name,
      listen(name, (event) => dispatch(name, event.payload))
    );
  }
  return () => unsubscribe(name, handler);
}

/** 取消一次订阅; 该事件无订阅者时释放底层监听。 */
export function unsubscribe<K extends BackendEventName>(
  name: K,
  handler: BackendEventHandler<K>
): void {
  const set = handlers.get(name);
  if (!set) return;
  set.delete(handler as RawHandler);
  if (set.size > 0) return;
  handlers.delete(name);
  const listening = pending.get(name);
  pending.delete(name);
  listening?.then((fn) => fn()).catch(() => {});
}

/** 退订全部事件并释放底层监听(登出/应用销毁时调用)。 */
export function unsubscribeAll(): void {
  handlers.clear();
  const listening = [...pending.values()];
  pending.clear();
  listening.forEach((p) => p.then((fn) => fn()).catch(() => {}));
}
