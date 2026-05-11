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

export type { FriendRequestInfoDTO, FriendRequestInfo };
