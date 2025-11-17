interface SystemNotification {
  id: string,
  /// 通知标题
  title?: string,
  /// 详细内容
  content?: string,
  /// 创建时间
  created_at?: number,
  /// 内容类型，0-纯文本，1-json, 2-xml
  content_type?: number,
  /// 接收人
  user_id?: string,
  /// 是否已读
  is_read?: boolean,

  /// 第一层级，用于定位功能大类
  level1?: number,
  /// 第二层级，用于定位子功能模块
  level2?: number,
  /// 第三层级，用于定位具体功能组
  level3?: number,
  /// 第四层级，用于定位详细功能项
  level4?: number,
  /// 未读数量
  unread_count?: number,
  /// 通知优先级
  priority?: number,
}

export {
  SystemNotification
}