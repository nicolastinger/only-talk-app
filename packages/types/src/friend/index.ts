interface FriendRequestInfoDTO {
  request_message?: string;
  accept_message?: string;
  request_user?: string;
  accept_user?: string;
  add_type?: string;
  version?: number;
  accept_status?: number;
}

interface FriendRequestInfo {
  request_message?: string;
  accept_message?: string;
  request_user?: string;
  accept_user?: string;
  add_type?: string;
  version?: number;
  accept_status?: number;
  uuid?: string;
  created_at: number;
  updated_at: number;
}

/**
 * HTTP 好友列表增量同步项(POST /friend/get_friend/{last_uuid}/{version} 返回)
 * — 镜像 rs FriendListVO。
 */
interface FriendListVo {
  uuid?: string;
  account?: string;
  username?: string;
  icon?: string;
  info?: string;
  is_del?: boolean;
  is_block?: boolean;
  version?: number;
  /** 毫秒时间戳 */
  updated_at?: number;
  /** 毫秒时间戳 */
  created_at?: number;
}

export type { FriendRequestInfoDTO, FriendRequestInfo, FriendListVo };
