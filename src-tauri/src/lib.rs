use tauri::{generate_handler, AppHandle, Manager};
mod quic_service;
use crc::Crc;
use dashmap::DashMap;
use lazy_static::lazy_static;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tauri::path::BaseDirectory;
use tokio::sync::RwLock;
mod cmd;
mod dto;
mod emit_app;
mod entity;
mod init_app;
mod service;
mod dao;
pub mod utils;
mod vo;
mod config;

use crate::cmd::api_controller::{
    add_user_map, batch_read_system_notification, create_chat_session, get_chat_record_from_store,
    get_chat_session_from_store, get_system_notification, get_user_map, mark_read,
    mark_read_chat_session, process_init_p2p_request, send_init_p2p_udp, send_p2p_init_msg,
    send_p2p_video_config, send_p2p_video_frame, send_text_msg, send_video_frame,
};
use crate::cmd::auth_controller::{clear_user_info, logout};
use crate::cmd::file_controller::{get_file_by_biz_id, get_local_file};
use crate::cmd::friend_controller::{get_friend_info, get_friend_list, update_local_friend_list};
use crate::init_app::init_app;
use crate::quic_service::models::TargetSendStream;
use entity::quic_connection::QuicConnection;
use utils::http_utils::{get_request, post_request, sign_in};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
// 创建CRC-16/X25计算器
const X25: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_IBM_SDLC);

lazy_static! {
    pub static ref GLOBAL_QUIC_SERVER_LIST: Arc<RwLock<HashMap<String, QuicConnection>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_QUIC_USER_INFO: Arc<RwLock<HashMap<String, String>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_READ_TASK_HANDLE: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>> =
        Arc::new(RwLock::new(None));
    pub static ref P2P_STREAM_SENDER: Arc<RwLock<HashMap<String, TargetSendStream>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_SQL_POOL: RwLock<Option<Arc<SqlitePool>>> = RwLock::new(None);
    pub static ref GLOBAL_COMMON_SQL_POOL: RwLock<Option<Arc<SqlitePool>>> = RwLock::new(None);
    // 全局配置DashMap
    pub static ref GLOBAL_CONFIG: Arc<DashMap<String, String>> = Arc::new(DashMap::new());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(non_snake_case)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("QT_QPA_PLATFORM", "wayland");
    }

    // 添加backtrace, 错误信息堆栈显示
    {
        std::env::set_var("RUST_BACKTRACE", "full");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).expect("初始化app失败"); // 初始化全局状态
                let handle = app.handle();
                let root_path = handle.path().resolve("", BaseDirectory::AppLocalData).expect("获取路径失败");
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = init_app(root_path).await {
                        eprintln!("初始化失败: {}", e);
                    }
                });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(generate_handler![
            send_text_msg,
            get_request,
            post_request,
            sign_in,
            logout,
            clear_user_info,
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
            get_system_notification,
            update_local_friend_list,
            batch_read_system_notification,
            mark_read_chat_session,
            get_local_file,
            get_file_by_biz_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
