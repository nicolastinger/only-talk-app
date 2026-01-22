interface Friend {
  id: number;
  created_at: number;
  updated_at: number;
  friend_id: string;
  friend_account: string;
  friend_name: string;
  friend_icon: string;
  friend_info: string;
  friend_status: number;
  me: string;
  is_del: boolean;
  is_block: number;
  is_mute: number;
  is_top: number;
  is_show: number;
  version: number;
}

export { Friend };