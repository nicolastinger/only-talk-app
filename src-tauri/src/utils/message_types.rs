//! 全局消息类型定义
//! 
//! 消息类型分类:
//! - 1-99: 基础消息类型(文本、图片、文件等)
//! - 100-199: P2P相关消息类型
//! - 200-299: 系统控制消息类型
//! - 1000+: 通知和系统消息

// ==================== 基础消息类型 ====================

/// 普通文本消息
pub const MSG_TYPE_TEXT: u16 = 1;

/// 图片消息
pub const MSG_TYPE_IMAGE: u16 = 2;

/// 文件消息
pub const MSG_TYPE_FILE: u16 = 3;

/// JSON消息
pub const MSG_TYPE_JSON: u16 = 88;

// ==================== P2P消息类型 ====================

/// P2P消息 - 用于P2P连接初始化
pub const MSG_TYPE_P2P: u16 = 4;

/// P2P视频呼叫 - 用于视频通话信令
pub const MSG_TYPE_P2P_VIDEO_CALL: u16 = 5;

/// P2P视频数据 - 传输视频帧数据
pub const MSG_TYPE_P2P_VIDEO_DATA: u16 = 6;

/// P2P视频配置 - 视频参数配置(分辨率、帧率等)
pub const MSG_TYPE_P2P_VIDEO_CONFIG: u16 = 7;

/// P2P文本消息 - 隐私聊天文本消息
pub const MSG_TYPE_P2P_TEXT: u16 = 8;

/// P2P音频数据 - 传输音频帧数据
/// 用于隐私模式视频聊天中的音频传输
/// 支持Opus编码，低延迟传输
pub const MSG_TYPE_P2P_AUDIO_DATA: u16 = 9;

/// P2P媒体配置 - 统一的媒体配置消息
/// 包含视频和音频的综合配置
/// 用于视频聊天初始化时的参数协商
pub const MSG_TYPE_P2P_MEDIA_CONFIG: u16 = 10;

/// P2P媒体控制 - 媒体流控制命令
/// 用于控制视频/音频的开关、暂停等操作
pub const MSG_TYPE_P2P_MEDIA_CONTROL: u16 = 11;

/// P2P视频通话邀请 - 发起视频通话请求
/// 当一方发起视频通话时，先发送此消息通知对方
/// 对方收到后应弹出视频通话界面或提示用户接听
pub const MSG_TYPE_P2P_VIDEO_CALL_INVITE: u16 = 12;

/// P2P视频通话接受 - 接受视频通话邀请
/// 当对方同意视频通话时发送此消息
/// 发送方收到后开始发送视频流
pub const MSG_TYPE_P2P_VIDEO_CALL_ACCEPT: u16 = 13;

/// P2P视频通话拒绝 - 拒绝视频通话邀请
/// 当对方拒绝视频通话时发送此消息
pub const MSG_TYPE_P2P_VIDEO_CALL_REJECT: u16 = 14;

/// P2P视频通话结束 - 结束视频通话
/// 当一方结束视频通话时发送此消息通知对方
pub const MSG_TYPE_P2P_VIDEO_CALL_END: u16 = 15;

/// P2P媒体信息 - 用于隐私模式视频聊天的媒体信息通道
/// 传输实时媒体状态信息，如分辨率变化、码率调整、帧率统计等
/// 与视频/音频数据通道分离，避免大数据帧阻塞控制信息
pub const MSG_TYPE_P2P_MEDIA_INFO: u16 = 16;

// ==================== P2P请求响应类型 ====================

/// 接受P2P请求
pub const P2P_ACCEPT_REQUEST: u16 = 103;

/// 拒绝P2P请求
pub const P2P_REJECT_REQUEST: u16 = 104;

// ==================== 心跳和控制消息 ====================

/// 心跳消息(Ping) - 用于连接保活
pub const MSG_TYPE_PING: u16 = 99;

/// WebRTC信令消息
pub const MSG_TYPE_WEBRTC_SIGNAL: u16 = 100;

/// 消息接收成功回执
pub const MSG_TYPE_RECALL_SUCCESS: u16 = 201;

/// 消息接收失败回执
pub const MSG_TYPE_RECALL_FAILURE: u16 = 202;

/// P2P服务端发起
pub const MSG_TYPE_P2P_USER_SERVER: u16 = 203;

/// P2P客户端
pub const MSG_TYPE_P2P_USER_CLIENT: u16 = 204;

/// 通知消息
pub const NOTIFY_TYPE_MSG: u16 = 1024;

/// 系统消息
pub const MSG_TYPE_SYSTEM: u16 = 10001;

/// 当前会话好友
pub const CURRENT_SESSION_FRIEND: &str = "current_session_friend";
