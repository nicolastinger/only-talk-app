import type { TextQuicMsgVo } from "@workspace/types";

/**
 * 移动端聊天消息的视图模型（统一单聊/群聊页面消息行）
 * 对应 PC 端 ChatMessage { from, ack, sender_*, text_msg_raw } 的 Vue 版本。
 */
export type MsgFrom = "mine" | "friend" | "system";

export interface UiChatMessage {
  from: MsgFrom;
  textMsg: TextQuicMsgVo;
  /** true=已送达；false=发送中；undefined=历史消息/无需状态 */
  ack: boolean | undefined;
  /** 客户端侧判定的发送失败（10s 未确认） */
  failed: boolean;
  showTime: boolean;
  /** 媒体消息已解析出的本地预览/真实 URL */
  imageUrl?: string | null;
  /** 图片消息的业务 ID（用于手动点击下载/预览） */
  imageBizId?: string;
  /** 图片发送中占位 */
  sendingImage?: boolean;
  /** 文件上传中(展示上传动画) */
  sendingFile?: boolean;
  /** 上传进度百分比 0-100(上传中展示进度条) */
  uploadProgress?: number;
  /** 群聊发送者昵称（解析后填充） */
  senderName?: string;
  senderUuid?: string;
}
