/** 群信息详情(HTTP GET/POST /group/chat/info|create 返回) — 镜像 rs GroupInfoVO */
interface GroupInfoVo {
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
  /** 1 正常, 2 已解散 */
  status: number;
}

/** 我的群列表项(HTTP GET /group/chat/my/list 返回) — 镜像 rs GroupListItemVO */
interface GroupListItemVo {
  group_uuid: string;
  group_name: string;
  avatar?: string;
  owner_uuid: string;
  member_count: number;
  /** 毫秒时间戳, 可为空 */
  last_msg_time?: number;
  unread_count: number;
}

/**
 * 群成员(HTTP GET /group/chat/member/list 返回) — 镜像 rs GroupMemberVO。
 * 展示名/头像等 UI 需要但后端不返回的字段, 由调用方用 user_info 缓存补齐。
 */
interface GroupMemberVo {
  user_uuid: string;
  /** 角色: 见后端 GroupMember role 常量 */
  role: number;
  /** 群内昵称, 可为空 */
  nickname?: string;
  /** 加入时间(毫秒) */
  join_time: number;
  /** 是否禁言 */
  muted: boolean;
  /** 状态 */
  status: number;
}

/** 群消息记录(HTTP POST /group/chat/message/history 返回) — 镜像 rs GroupMessageVO */
interface GroupMessageVo {
  nano_id: string;
  group_uuid: string;
  send_user: string;
  /** 毫秒时间戳 */
  timestamp: number;
  /** bincode 原始载荷序列化后的字节数组 */
  raw: number[];
  /** 消息类型: 1 文本, 2 图片, 3 文件 */
  msg_type: number;
  recalled: boolean;
}

/** 群未读计数(HTTP GET /group/chat/message/unread 返回) — 镜像 rs UnreadCountVO */
interface UnreadCountVo {
  group_uuid: string;
  unread_count: number;
  last_read_msg_id: number;
}

/** 群邀请(HTTP GET /group/chat/member/invite/pending|sent 返回) — 镜像 rs GroupInvitationVO */
interface GroupInvitationVo {
  id: number;
  group_uuid: string;
  group_name: string;
  group_avatar?: string;
  inviter_uuid: string;
  invitee_uuid: string;
  /** 邀请状态 */
  status: number;
  /** 毫秒时间戳 */
  created_at: number;
}

export type {
  GroupInfoVo,
  GroupListItemVo,
  GroupMemberVo,
  GroupMessageVo,
  UnreadCountVo,
  GroupInvitationVo,
};
