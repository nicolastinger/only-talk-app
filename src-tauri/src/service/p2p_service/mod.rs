//! P2P 服务。
//!
//! 原 `p2p_service.rs` 把「自建 P2P 传输」与「视频通话信令（WebRTC 风格）」等
//! 多类职责揉在一起，现按职责拆分为子模块，`mod.rs` 仅做组织与再导出，
//! 对外路径 `crate::service::p2p_service::*` 保持不变：
//!
//! - [`nat`]：NAT 端口配置与 IP 类型探测
//! - [`connection`]：自建 P2P 连接建立/接受/拒绝、运行与资源清理
//! - [`media`]：自建 P2P 媒体数据面（音视频帧/文本/媒体控制）
//! - [`call`]：视频通话信令（邀请/响应/结束/就绪/配置）
//! - [`file_transfer`]：P2P 文件传输

mod call;
mod connection;
mod file_transfer;
mod media;
mod nat;

pub use call::{
    send_p2p_media_ready_service, send_p2p_video_call_end_service,
    send_p2p_video_call_invite_service, send_p2p_video_call_response_service,
    send_p2p_video_config_service,
};
pub use connection::{
    access_p2p_request, close_p2p_connection_service, process_p2p_msg, reject_p2p_request,
    run_p2p_client, run_p2p_server, send_p2p_init_msg,
};
pub use file_transfer::{
    send_p2p_file_data_service, send_p2p_file_transfer_request_service,
    send_p2p_file_transfer_response_service,
};
pub use media::{
    send_p2p_audio_frame_service, send_p2p_media_config_service, send_p2p_media_control_service,
    send_p2p_media_info_service, send_p2p_text_msg_service, send_p2p_video_frame_service,
};
pub use nat::{
    check_ipv6_support, check_user_ip_type, find_available_udp_port, get_nat_udp_ports, NatUdpPorts,
};
