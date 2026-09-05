/**
 * 消息类型常量（对齐 only-talk-rs/crates/common/src/utils/message_types.rs）
 * 与 PC 端渲染分发保持一致，避免魔法数字散落各处。
 */

// 单聊
export const MSG_TYPE_TEXT = 1; // 单聊文本
export const MSG_TYPE_IMAGE = 2; // 单聊图片
export const MSG_TYPE_FILE = 3; // 单聊文件
export const MSG_TYPE_P2P = 4; // P2P 隐私消息
export const MSG_TYPE_P2P_VIDEO_CALL = 5; // P2P 视频通话
export const MSG_TYPE_P2P_VIDEO_DATA = 6;
export const MSG_TYPE_P2P_VIDEO_CONFIG = 7;
export const MSG_TYPE_P2P_PRIVATE_TEXT = 8;
export const MSG_TYPE_JSON = 88; // 通用 JSON
export const MSG_TYPE_PING = 99; // 心跳
export const MSG_TYPE_P2P_VIDEO_CALL_INVITE = 12; // 通话邀请
export const MSG_TYPE_P2P_VIDEO_CALL_ACCEPT = 13; // 已接听
export const MSG_TYPE_P2P_VIDEO_CALL_REJECT = 14; // 已拒绝
export const MSG_TYPE_P2P_VIDEO_CALL_END = 15; // 通话结束
export const MSG_TYPE_WEBRTC_SIGNAL = 100; // WebRTC 信令
export const MSG_TYPE_RECALL_SUCCESS = 201; // 私聊送达 ack
export const MSG_TYPE_RECALL_FAILURE = 202; // 私聊发送失败 ack
export const MSG_TYPE_P2P_USER_SERVER = 203;
export const MSG_TYPE_P2P_USER_CLIENT = 204;

// 群聊
export const MSG_TYPE_GROUP_TEXT = 2001; // 群聊文本
export const MSG_TYPE_GROUP_IMAGE = 2002; // 群聊图片
export const MSG_TYPE_GROUP_FILE = 2003; // 群聊文件
export const MSG_TYPE_GROUP_NOTIFICATION = 2004; // 群通知
export const MSG_TYPE_GROUP_ACK = 2201; // 群送达 ack

// 系统
export const MSG_TYPE_SYSTEM = 10001;
export const MSG_TYPE_FORCE_LOGOUT = 10002;

/** 群聊中的 ACK 由 group_message_ack 事件送达，前端不当作气泡渲染 */
export const ACK_TYPES = [
  MSG_TYPE_RECALL_SUCCESS,
  MSG_TYPE_RECALL_FAILURE,
  MSG_TYPE_GROUP_ACK,
];

/** 渲染时需要先解析 raw 是否为本地文件路径的媒体消息（发送中的临时气泡） */
export const MEDIA_TYPES = [
  MSG_TYPE_IMAGE,
  MSG_TYPE_FILE,
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_FILE,
];

/** 发送后收到 ack 需要重载历史（把本地临时路径替换为服务器记录）的媒体消息 */
export const RELOAD_ON_ACK_TYPES = [
  MSG_TYPE_IMAGE,
  MSG_TYPE_FILE,
  MSG_TYPE_GROUP_IMAGE,
  MSG_TYPE_GROUP_FILE,
];

/** 居中灰条展示的消息：群通知 / 系统消息 */
export const SYSTEM_LIKE_TYPES = [MSG_TYPE_GROUP_NOTIFICATION, MSG_TYPE_SYSTEM];
