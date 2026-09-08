/** 本地聊天会话(桌面端 get_chat_session_from_store 返回) — 镜像 src-tauri ChatSessionVo */
interface ChatSessionVo {
  nano_id: string;
  /** 毫秒时间戳 */
  timestamp: number;
  text_type: number;
  unread_count: number;
  last_message: string;
  recv_user: string;
  send_user: string;
  /** 0 单聊, 1 群聊 */
  session_type: number;
  is_show: number;
  is_top: number;
  friend_icon: string;
  friend_name: string;
  /** 群聊时为群 uuid */
  group_id?: string;
}

/** 会话列表事件载荷 — 镜像 src-tauri ChatSessionEvent */
interface ChatSessionEvent {
  type: number;
  data: ChatSessionVo;
}

/** 本地好友列表项(桌面端 get_friend_list 返回) — 镜像 src-tauri FriendVo */
interface FriendVo {
  /** 毫秒时间戳 */
  timestamp: number;
  friend_id: string;
  friend_account: string;
  friend_name: string;
  friend_icon: string;
  friend_status: number;
  is_del: boolean;
  is_block: number;
  is_mute: number;
  is_top: number;
  is_show: number;
}

/**
 * 本地文件记录(桌面端 get_file_by_biz_id/get_chat_file_by_biz_id 返回)
 * — 镜像 src-tauri vo::FileVo。前端运行时会在其上追加 tauri_file_path,
 * 该字段为本地缓存专用, 见 FileVoLocal(packages/services)。
 */
interface FileVo {
  file_id?: string;
  /** 字节 */
  size?: number;
  file_hash?: string;
  /** 毫秒时间戳 */
  created_at?: number;
  /** 毫秒时间戳 */
  updated_at?: number;
  created_by?: string;
  updated_by?: string;
  status?: number;
  file_extension?: string;
  mime_type?: string;
  description?: string;
  original_file_name?: string;
  original_file_path?: string;
  /** 磁盘绝对路径(get_file_by_biz_id 等填充) */
  absolute_file_path?: string;
  /** 文件字节 */
  raw?: number[];
  is_del?: number;
}

/**
 * 本地群组行(桌面端 get_group_list/get_group_info_command 返回)
 * — 镜像 src-tauri vo::GroupVo(本地库行, 含列表+详情字段)。
 */
interface GroupVo {
  group_uuid: string;
  group_name: string;
  avatar?: string;
  owner_uuid: string;
  description?: string;
  max_members: number;
  member_count: number;
  /** 毫秒时间戳 */
  created_at: number;
  /** 毫秒时间戳 */
  updated_at: number;
  status: number;
  /** 毫秒时间戳, 可为空 */
  last_msg_time?: number;
  unread_count: number;
}

/**
 * 本地群成员行(桌面端 sync_group_members_command 返回)
 * — 镜像 src-tauri vo::GroupMemberVo(本地库行, 含展示名/头像)。
 */
interface GroupMemberStoreVo {
  group_id: string;
  user_id: string;
  username: string;
  icon: string;
  role: number;
  nickname: string;
  /** 毫秒时间戳 */
  joined_at: number;
}

/** 黑名单列表项(桌面端 get_black_list 返回) — 镜像 src-tauri BlackListVo */
interface BlackListVo {
  uuid: string;
  account?: string;
  username?: string;
  icon?: string;
  /** 毫秒时间戳 */
  created_at?: number;
}

export type {
  ChatSessionEvent,
  ChatSessionVo,
  FriendVo,
  FileVo,
  GroupVo,
  GroupMemberStoreVo,
  BlackListVo,
};
