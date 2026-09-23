// 会话列表与离线同步类型(任务07 §7, 与服务端任务 04–06 的 VO 逐字段对齐)

/** 会话列表项(POST /session/list) */
export interface SessionListItem {
  session_uuid: string;
  session_type: 1 | 2;
  /** 单聊: 对方; 群聊: null(用 session_uuid 查群资料) */
  peer_uuid: string | null;
  last_message_id: number;
  last_message_at: number;
  last_preview: string;
  pinned: number; // 0 | 1
  muted: number; // 0 | 1
  unread: number;
}

/** 会话列表 keyset 游标(客户端原样回传) */
export interface SessionListCursor {
  pinned: number;
  last_message_at: number;
  session_uuid: string;
}

/** 会话列表响应 */
export interface SessionListResponse {
  sessions: SessionListItem[];
  has_more: boolean;
  next_cursor: SessionListCursor | null;
}

/** 离线同步请求项(POST /session/sync, 任务12 正向追平: 客户端发送本地已同步的最新 id) */
export interface SyncSessionRequest {
  session_uuid: string;
  /** 正向起点: 服务端返回窗口内 id > after_id 的消息(升序); 省略 = 0(从窗口内最早起) */
  after_id?: number;
}

/** 离线同步请求(POST /session/sync, 任务12) */
export interface SyncRequest {
  sessions: SyncSessionRequest[];
  limit?: number;
}

/** 离线同步消息(POST /session/sync) */
export interface SyncMessage {
  id: number;
  nano_id: string;
  session_uuid: string;
  session_type: 1 | 2;
  send_user: string;
  /** 群聊时即 group_uuid */
  recv_user: string;
  /** 单聊/群聊值域不同, 按 session_type 解释 */
  text_type: number;
  timestamp: number;
  raw: number[];
}

/** 单会话同步结果 */
export interface SyncSession {
  session_uuid: string;
  session_type: 1 | 2;
  messages: SyncMessage[];
  /** 本批最大消息 id(= 末条 id; 空批 = 请求的 after_id); 客户端以此续拉并回报 /session/synced */
  next_cursor: number;
  /** 窗口内是否还有更多; false = 已追平服务端最新 id 或 7 天窗口尽头 */
  has_more: boolean;
}

/** 离线同步响应 */
export interface SyncResponse {
  server_time: number;
  sessions: SyncSession[];
}

/** 已读上报项(POST /session/read) */
export interface SessionReadItem {
  session_uuid: string;
  session_type: 1 | 2;
  last_read_id: number;
}

/** 同步游标回报项(POST /session/synced) */
export interface SessionSyncedItem {
  session_uuid: string;
  synced_id: number;
}

/** 控制信息请求(POST /session/pin | /session/mute | /session/delete) */
export interface SessionControlRequest {
  session_uuid: string;
  /** pin/mute: 目标值(0/1); delete 忽略 */
  value?: number;
}

// ===== 任务12 正向追平: 追平记录(get_sync_history 命令) =====

/** 单会话追平记录(一轮重连/登录 = 一批) */
export interface SyncTaskItem {
  id: number;
  batch_id: number;
  session_uuid: string;
  /** 任务类型(恒为正向追平) */
  kind: number;
  /** 2-成功 3-失败 */
  status: number;
  batches: number;
  new_count: number;
  attempt: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/** 追平记录批次视图(get_sync_history 命令): 一轮一批 */
export interface SyncBatchView {
  batch_id: number;
  total: number;
  success: number;
  failed: number;
  pending: number;
  tasks: SyncTaskItem[];
}
