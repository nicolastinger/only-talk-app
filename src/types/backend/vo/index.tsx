interface ChatSessionVo {
  nano_id: string;
  timestamp: number;
  text_type: number;
  unread_count: number;
  last_message: string;
  recv_user: string;
  send_user: string;
  session_type: number; // 1-单聊，2-群聊，3-系统，4-公众号
  is_show: number;
  is_top: number;
  friend_icon: string;
  friend_name: string;
}

interface ChatSessionEvent {
  type: number;
  data: ChatSessionVo;
}

export { ChatSessionVo, ChatSessionEvent }