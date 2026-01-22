interface FriendRequestInfoDTO {
  // 请求信息
  request_message?: string;
  accept_message?: string;
  request_user?: string;
  accept_user?: string;
  // 添加方式
  add_type?: string;
  version?: number;
  // 状态
  accept_status?: number;
}

interface FriendRequestInfo {
  // 请求信息
  request_message?: string;
  accept_message?: string;
  request_user?: string;
  accept_user?: string;
  // 添加方式
  add_type?: string;
  version?: number;
  // 状态
  accept_status?: number;
  uuid?: string,
  created_at: number,
  updated_at: number,
}

export { FriendRequestInfoDTO, FriendRequestInfo };
