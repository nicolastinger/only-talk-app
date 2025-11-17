use tauri::{generate_handler, AppHandle};
mod quic_service;
use crc::Crc;
use fast_log::Config;
use lazy_static::lazy_static;
use log::{info, warn, LevelFilter};
use std::collections::HashMap;
use std::net::SocketAddrV6;
use std::sync::{Arc, OnceLock};
use tokio::sync::RwLock;
mod service;
mod controller;
mod entity;
mod store;
pub mod utils;
mod vo;
mod dto;
mod emit_app;

use crate::controller::api_controller::{add_user_map, create_chat_session, get_chat_record_from_store, get_chat_session_from_store, get_friend_info, get_friend_list, get_system_notification, get_user_map, mark_read, process_init_p2p_request, send_init_p2p_udp, send_p2p_init_msg, send_p2p_video_config, send_p2p_video_frame, send_text_msg, send_video_frame};
use utils::http_utils::{get_request, post_request, sign_in};
use crate::quic_service::p2p_stream_quic_server::{
    udp_port_forward_ipv6
};
use crate::utils::global_static_str::{UDP_SOCKET_V6};
use entity::quic_connection::QuicConnection;
use store::init_db::init_sqlite;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
// 创建CRC-16/X25计算器
const X25: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_IBM_SDLC);

lazy_static! {
    pub static ref GLOBAL_QUIC_SERVER_LIST: Arc<RwLock<HashMap<String, QuicConnection>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_QUIC_USER_INFO: Arc<RwLock<HashMap<String, String>>> =
        Arc::new(RwLock::new(HashMap::new()));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    fast_log::init(
        Config::new()
            .console()
            .level(LevelFilter::Info)
            .file("target/rust_im.log")
            .chan_len(Some(10)),
    )
    .unwrap();
    info!("日志初始化完成");

    // 定义服务器监听地址
    tokio::spawn(async {
        let addr_v6 = "[::]:10086";
        let addr_v6_socket: SocketAddrV6 = addr_v6.parse::<SocketAddrV6>().unwrap();
        let udp_socket_v6 = UDP_SOCKET_V6.parse::<SocketAddrV6>().unwrap();
        let addr_json = Vec::new();
        udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json)
            .await
            .unwrap_or_else(|x| {
                warn!("本机不支持ipv6传输 {}", x.to_string());
            });
        init_sqlite().await.expect("初始化数据库失败!");
    });

    tauri::Builder::default()
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).expect("初始化app失败"); // 初始化全局状态
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(generate_handler![
            send_text_msg,
            get_request,
            post_request,
            sign_in,
            get_user_map,
            add_user_map,
            send_video_frame,
            send_p2p_init_msg,
            send_init_p2p_udp,
            process_init_p2p_request,
            send_p2p_video_config,
            send_p2p_video_frame,
            get_chat_record_from_store,
            get_chat_session_from_store,
            get_friend_info,
            mark_read,
            get_friend_list,
            create_chat_session,
            get_system_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
