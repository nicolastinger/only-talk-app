interface ChatSessionVo {
  nano_id: string;
  timestamp: number;
  text_type: number;
  unread_count: number;
  last_message: string;
  recv_user: string;
  send_user: string;
  session_type: number;
  is_show: number;
  is_top: number;
  friend_icon: string;
  friend_name: string;
}

interface ChatSessionEvent {
  type: number;
  data: ChatSessionVo;
}

interface FriendVo {
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

interface FileVo {
  file_id?: string;
  size?: number;
  file_hash?: string;
  created_at?: number;
  updated_at?: number;
  created_by?: string;
  updated_by?: string;
  status?: number;
  file_extension?: string;
  mime_type?: string;
  description?: string;
  original_file_name?: string;
  original_file_path?: string;
  relative_path?: string;
  relative_file_name?: string;
  absolute_file_path?: string;
  raw?: number[];
  blob_url?: string;
  is_del?: number;
  tauri_file_path?: string;
}

export type { ChatSessionEvent, ChatSessionVo, FriendVo, FileVo };
