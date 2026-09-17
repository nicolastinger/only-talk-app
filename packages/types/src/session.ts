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

/** 离线同步请求项(POST /session/sync, 任务12: 客户端显式携带拉取起点) */
export interface SyncSessionRequest {
  session_uuid: string;
  /** 续拉: 窗口内 id < before_id 的最新 limit 条; 省略 = 首拉(无上界) */
  before_id?: number;
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
  next_cursor: number;
  has_more: boolean;
  truncated_by_window: boolean;
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

// ===== 任务12: 同意式离线同步(命令 / 事件契约) =====

/** 回填提示状态(get_backfill_state 命令) */
export interface BackfillState {
  /** 是否应弹「同步最近 7 天」提示 */
  should_prompt: boolean;
  /** 回填完成态: 0-未回填过 1-完成 2-跳过 */
  backfill: number;
  /** 是否有待执行/执行中的回填任务 */
  in_progress: boolean;
}

/** 回填进度事件 `session_backfill_progress` 载荷 */
export interface BackfillProgressPayload {
  session_uuid: string;
  new_count: number;
}

/** 同步任务项(get_sync_history 命令, 批内明细) */
export interface SyncTaskItem {
  id: number;
  batch_id: number;
  session_uuid: string;
  /** 0-静默补拉(重连轮) 1-回填 */
  kind: number;
  /** 0-待执行 1-执行中 2-成功 3-失败 */
  status: number;
  batches: number;
  new_count: number;
  attempt: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/** 批次视图(get_sync_history 命令): 一次触发一批 */
export interface SyncBatchView {
  batch_id: number;
  total: number;
  success: number;
  failed: number;
  pending: number;
  tasks: SyncTaskItem[];
}
