interface TextMsgRaw {
  text: string; //消息内容
  prev_id: string; //上一条消息id
  platform: number; //平台, 0: pc, 1: mobile
}

interface ImageRecord {
  prev_id: string;
  biz_id: string;
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

interface TextQuicMsgVo {
  nano_id: string; //消息id
  text_type: number; //消息类型，1: 文本，2: 图片，3: 文件
  raw: string; //数据
  recv_user: string; //接收用户
  send_user: string; //发送用户
  timestamp: number; //消息时间戳
}

export { TextMsgRaw, TextQuicMsgVo, ImageRecord, FileRecord };
