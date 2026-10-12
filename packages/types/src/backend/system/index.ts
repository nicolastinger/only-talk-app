interface SystemNotification {
  id?: string;
  title?: string;
  content?: string;
  /** 毫秒时间戳 */
  created_at?: number;
  content_type?: number;
  user_id?: string;
  is_read?: boolean;
  /** 好友请求时为 FriendRequestInfo.uuid; 群邀请时为 group uuid */
  biz_id?: string;
  level1?: number;
  level2?: number;
  level3?: number;
  level4?: number;
  unread_count?: number;
  priority?: number;
}

export type { SystemNotification };
