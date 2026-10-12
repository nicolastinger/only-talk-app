interface TextMsgRaw {
  text: string; //消息内容
  prev_id: string; //上一条消息id
  platform: number; //平台, 0: pc, 1: mobile
}

interface ImageRecord {
  prev_id: string;
  biz_id: string;
  file_name: string;
  is_preview: boolean;
  img_width: number;
  img_height: number;
  img_size: number;
  platform: number;
}

interface FileRecord {
  prev_id: string;
  biz_id: string;
  file_name: string;
  file_size: number;
  file_type: string; // 文件扩展名
  platform: number;
}

/**
 * QUIC 实时消息体 — 镜像 rs common::utils::TextQuicMsg / src-tauri TextQuicMsgVo。
 * text_type 语义(见 rs message_types.rs):
 *   1 文本, 2 图片, 3 文件, 5/6/7/12-15 P2P 视频, 100 WebRTC 信令,
 *   201/202 发送回执, 203/204 P2P 角色, 99 心跳,
 *   1024 系统通知(raw 为 JSON SystemNotification), 10001 系统消息, 10002 强制下线,
 *   2001 群文本, 2002 群图片, 2003 群文件, 2004 群系统通知, 2201 群发送回执
 */
interface TextQuicMsgVo {
  nano_id: string; //消息id
  text_type: number; //消息类型
  raw: string; //数据(文本或 JSON 字符串)
  recv_user: string; //接收用户(群聊时为群 uuid)
  send_user: string; //发送用户
  timestamp: number; //消息时间戳(毫秒)
}

/**
 * 单聊 HTTP 记录行(POST /msg/get_chat_record/{uuid} 返回) — 镜像 rs ChatMessageRecord。
 * 注意 raw 为 bincode 字节数组, 与 TextQuicMsgVo.raw(字符串)不同。
 */
interface ChatMessageRecord {
  id?: number;
  nano_id?: string;
  /** 毫秒时间戳 */
  timestamp?: number;
  /** 原始载荷字节数组 */
  raw: number[];
  text_type?: number;
  send_user: string;
  recv_user: string;
}

interface GroupTextRecord {
  text: string;
  send_user: string;
}

interface GroupImageRecord {
  biz_id: string;
  file_name: string;
  img_width: number;
  img_height: number;
  img_size: number;
  send_user: string;
}

interface GroupFileRecord {
  biz_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  send_user: string;
}

interface ChatRecordSend {
  id: number;
  send_id: string;
  msg_id: string;
  text_type: number;
  platform: number;
  recv_user: string;
  send_user: string;
  timestamp: number;
  raw: string; // JSON 字符串
  send_status: number; // -1-已忽略，0-排队中，1-发送中，2-发送失败，3-发送成功
  retry_count: number;
}

export type {
  TextMsgRaw,
  TextQuicMsgVo,
  ChatMessageRecord,
  ImageRecord,
  FileRecord,
  GroupTextRecord,
  GroupImageRecord,
  GroupFileRecord,
  ChatRecordSend,
};