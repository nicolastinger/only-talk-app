interface AnnouncementVO {
  uuid: string;
  title: string;
  content: string;
  /** 内容类型: 0-markdown, 1-html */
  content_type: number;
  start_at: number;
  end_at: number;
  created_at: number;
  is_read: boolean;
  read_count: number;
}

interface AnnouncementListResult {
  total: number;
  list: AnnouncementVO[];
}

interface AnnouncementReadUserVO {
  uuid: string;
  username?: string;
  icon?: string;
  /** 用户类型 (0: 普通用户, 1: 机器人, 2: 企业用户, 其他待补充) */
  user_type?: number;
  created_at: number;
}

interface AnnouncementReadUserListResult {
  total: number;
  list: AnnouncementReadUserVO[];
}

export type {
  AnnouncementVO,
  AnnouncementListResult,
  AnnouncementReadUserVO,
  AnnouncementReadUserListResult,
};
