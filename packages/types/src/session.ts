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
