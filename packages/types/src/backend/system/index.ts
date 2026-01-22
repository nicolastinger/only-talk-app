interface SystemNotification {
  id: string,
  title?: string,
  content?: string,
  created_at?: number,
  content_type?: number,
  user_id?: string,
  is_read?: boolean,
  level1?: number,
  level2?: number,
  level3?: number,
  level4?: number,
  unread_count?: number,
  priority?: number,
}

export {
  SystemNotification
}