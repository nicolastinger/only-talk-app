use serde::{Deserialize, Serialize};

/// P2P连接初始化消息
/// 用于建立P2P连接时的握手信息交换
#[derive(Debug, Serialize, Deserialize)]
pub struct P2pInitMsg {
    /// 请求人地址
    pub accept_addr: String,
    /// 请求人地址
    pub request_addr: String,
    /// 请求人uuid
    pub request_uuid: String,
    /// 请求人token - 用于验证身份
    pub request_token: String,
    /// 接收人uuid
    pub accept_uuid: String,
    /// 是否接受连接请求
    pub accept: bool,
    /// ip类型 - 1:IPv4, 2:IPv6
    pub ip_type: u8,
    /// 连接步骤状态
    /// 0-未处理，1-已拒绝，2-已接受，3-交换ip
    pub step: u8,
    /// 是否作为服务端
    pub is_server: bool,
}

/// 用户地址信息
/// 用于P2P连接时的地址交换
#[derive(Debug, Serialize, Deserialize)]
pub struct UserAddressInfo {
    /// 用户唯一标识
    pub uuid: String,
    /// 网络地址 (IP:Port格式)
    pub address: String,
    /// 验证令牌
    pub token: String,
    /// IP类型 - 1:IPv4, 2:IPv6
    pub ip_type: u8,
    /// 目标用户UUID
    pub target_uuid: String,
    /// NAT类型 - 用于穿透策略
    pub nat_type: u8,
    /// 是否作为服务端
    pub is_server: bool,
    /// 锁定UUID - 用于防止重复连接
    pub lock_uuid: String,
    /// 是否已锁定
    pub is_lock: bool,
}

/// P2P视频数据包
/// 用于传输视频帧数据
#[derive(Debug, Serialize, Deserialize)]
pub struct P2pVideoData {
    /// 目标用户UUID
    pub uuid: String,
    /// 视频帧数据 (已编码)
    pub video_data: Vec<u8>,
}

/// P2P音频数据包
/// 用于传输音频帧数据
#[derive(Debug, Serialize, Deserialize)]
pub struct P2pAudioData {
    /// 目标用户UUID
    pub uuid: String,
    /// 音频帧数据 (Opus编码)
    pub audio_data: Vec<u8>,
    /// 时间戳 - 用于音视频同步
    pub timestamp: u64,
    /// 序列号 - 用于排序和丢包检测
    pub sequence: u32,
}

/// P2P视频配置
/// 用于视频通话参数协商
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pVideoConfig {
    /// 视频宽度 (像素)
    pub width: u16,
    /// 视频高度 (像素)
    pub height: u16,
    /// 帧率 (fps)
    pub fps: u8,
    /// 视频编码方式 (如: "video/webm;codecs=vp8")
    pub encode: String,
    /// 视频码率 (bps)
    pub bitrate: u32,
    /// 是否开启视频
    pub video: bool,
    /// 是否开启音频
    pub audio: bool,
}

/// 音频配置
/// 用于音频参数设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pAudioConfig {
    /// 采样率 (Hz) - 如: 48000
    pub sample_rate: u32,
    /// 声道数 - 1:单声道, 2:立体声
    pub channels: u8,
    /// 音频编码方式 (如: "audio/opus")
    pub encode: String,
    /// 音频码率 (bps)
    pub bitrate: u32,
    /// 是否开启回声消除
    pub echo_cancellation: bool,
    /// 是否开启噪声抑制
    pub noise_suppression: bool,
    /// 是否开启自动增益控制
    pub auto_gain_control: bool,
}

/// P2P媒体配置
/// 统一的视频和音频配置消息
/// 用于视频聊天初始化时的参数协商
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pMediaConfig {
    /// 视频配置
    pub video_config: P2pVideoConfig,
    /// 音频配置
    pub audio_config: P2pAudioConfig,
    /// 缓冲配置
    pub buffer_config: P2pBufferConfig,
}

/// 缓冲配置
/// 用于控制媒体流的缓冲策略
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pBufferConfig {
    /// 视频缓冲大小 (帧数)
    pub video_buffer_size: u8,
    /// 音频缓冲大小 (帧数)
    pub audio_buffer_size: u8,
    /// 是否启用自适应缓冲
    pub adaptive_buffer: bool,
    /// 最大延迟 (毫秒)
    pub max_latency_ms: u16,
}

/// 媒体控制命令
/// 用于控制视频/音频的开关等操作
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pMediaControl {
    /// 控制类型
    pub control_type: P2pMediaControlType,
    /// 是否启用
    pub enabled: bool,
    /// 时间戳
    pub timestamp: u64,
}

/// 媒体控制类型枚举
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum P2pMediaControlType {
    /// 视频开关
    VideoToggle,
    /// 音频开关
    AudioToggle,
    /// 暂停
    Pause,
    /// 恢复
    Resume,
    /// 结束通话
    EndCall,
}

/// 视频通话邀请
/// 当一方发起视频通话时发送此消息
/// 包含邀请者的基本信息和媒体配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pVideoCallInvite {
    /// 邀请者UUID (发送方)
    pub from_uuid: String,
    /// 被邀请者UUID (接收方)
    pub to_uuid: String,
    /// 邀请时间戳
    pub timestamp: u64,
    /// 邀请者的媒体配置 (可选，用于提前协商)
    pub media_config: Option<P2pMediaConfig>,
    /// 邀请者的昵称/用户名 (用于显示)
    pub from_name: Option<String>,
}

/// 视频通话响应
/// 当接收方接受或拒绝视频通话时发送
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pVideoCallResponse {
    /// 响应者UUID
    pub from_uuid: String,
    /// 邀请者UUID
    pub to_uuid: String,
    /// 是否接受邀请
    pub accept: bool,
    /// 响应时间戳
    pub timestamp: u64,
    /// 响应者的媒体配置 (接受时携带)
    pub media_config: Option<P2pMediaConfig>,
    /// 拒绝原因 (拒绝时可选)
    pub reject_reason: Option<String>,
}

/// 视频通话状态
/// 用于跟踪视频通话的生命周期状态
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum P2pVideoCallState {
    /// 空闲状态 - 无通话
    Idle,
    /// 正在邀请 - 等待对方响应
    Inviting,
    /// 被邀请 - 收到邀请，等待用户操作
    Invited,
    /// 通话中 - 双方已建立连接
    InCall,
    /// 已结束 - 通话结束
    Ended,
}

/// P2P消息 - 前端通信
/// 用于向前端发送P2P事件通知
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pMsg {
    /// 消息类型
    pub r#type: u16,
    /// 消息内容 (JSON序列化)
    pub raw: String,
}

/// 默认视频配置实现
impl Default for P2pVideoConfig {
    fn default() -> Self {
        Self {
            width: 640,           // 低画质: 640x480
            height: 480,
            fps: 15,              // 较低帧率
            encode: "video/webm;codecs=vp8".to_string(),
            bitrate: 500_000,     // 500kbps
            video: true,
            audio: true,
        }
    }
}

/// 默认音频配置实现
impl Default for P2pAudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            channels: 1,          // 单声道节省带宽
            encode: "audio/opus".to_string(),
            bitrate: 32000,       // 32kbps
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: true,
        }
    }
}

/// 默认缓冲配置实现
impl Default for P2pBufferConfig {
    fn default() -> Self {
        Self {
            video_buffer_size: 5,  // 缓冲5帧
            audio_buffer_size: 10, // 缓冲10帧
            adaptive_buffer: true,
            max_latency_ms: 200,   // 最大200ms延迟
        }
    }
}

/// 默认媒体配置实现
impl Default for P2pMediaConfig {
    fn default() -> Self {
        Self {
            video_config: P2pVideoConfig::default(),
            audio_config: P2pAudioConfig::default(),
            buffer_config: P2pBufferConfig::default(),
        }
    }
}
