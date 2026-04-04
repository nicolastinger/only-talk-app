use tauri::{generate_handler, AppHandle, Manager};
mod quic_service;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use crc::Crc;
use dashmap::DashMap;
use lazy_static::lazy_static;
use sqlx::SqlitePool;
use tauri::path::BaseDirectory;
use tokio::sync::{Mutex, RwLock};
pub mod cmd;
mod config;
mod dao;
mod dto;
mod emit_app;
mod entity;
mod init_app;
pub mod service;
mod tray;
pub mod utils;
mod vo;

use entity::quic_connection::QuicConnection;

use crate::cmd::api_controller::{
    compress_image_to_webp_command, get_request, post_form_data_request, post_request,
    upload_file_request, upload_file_with_extra_fields_request, upload_multiple_files_request,
    upload_multiple_files_with_extra_fields_request,
};
use crate::cmd::auth_controller::{clear_user_info, logout, sign_in};
use crate::cmd::chat_record_controller::{
    get_chat_record_by_type, get_chat_record_from_store, mark_read, send_image_msg, send_text_msg,
};
use crate::cmd::chat_session_controller::{
    create_chat_session, get_chat_session_from_store, mark_read_chat_session,
};
use crate::cmd::file_controller::{
    debug_resource_paths, get_chat_file_by_biz_id, get_file_by_biz_id, get_local_file,
};
use crate::cmd::friend_controller::{delete_friend_command, get_friend_info, get_friend_list, update_local_friend_list};
use crate::cmd::notification_controller::{
    batch_read_system_notification, get_system_notification,
};
use crate::cmd::p2p_controller::{
    close_p2p_connection, process_init_p2p_request, send_init_p2p_udp, send_p2p_audio_frame,
    send_p2p_init_msg, send_p2p_media_config, send_p2p_media_control, send_p2p_text_msg,
    send_p2p_video_call_invite, send_p2p_video_config, send_p2p_video_frame, send_video_frame,
};
use crate::cmd::user_controller::{add_user_map, get_user_map};
use crate::init_app::init_app;
use crate::quic_service::models::TargetSendStream;
use crate::tray::setup_tray;
use crate::utils::global_static_str::APP_NAME;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
// 创建CRC-16/X25计算器
const X25: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_IBM_SDLC);

lazy_static! {
    pub static ref GLOBAL_QUIC_SERVER_LIST: Arc<RwLock<HashMap<String, QuicConnection>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_QUIC_USER_INFO: Arc<RwLock<HashMap<String, String>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref P2P_STREAM_SENDER: Arc<RwLock<HashMap<String, TargetSendStream>>> =
        Arc::new(RwLock::new(HashMap::new()));
    pub static ref GLOBAL_SQL_POOL: RwLock<Option<Arc<SqlitePool>>> = RwLock::new(None);
    pub static ref GLOBAL_COMMON_SQL_POOL: RwLock<Option<Arc<SqlitePool>>> = RwLock::new(None);
    pub static ref GLOBAL_PRIVATE_SQL_POOL: RwLock<Option<Arc<SqlitePool>>> = RwLock::new(None);
    // 全局配置DashMap
    pub static ref GLOBAL_CONFIG: Arc<DashMap<String, String>> = Arc::new(DashMap::new());
    // 消息发送，全局mutex锁
    pub static ref GLOBAL_MSG_SEND_LOCK: Arc<Mutex<()>> = Arc::new(Mutex::new(()));
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
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).expect("初始化app失败"); // 初始化全局状态
            let handle = app.handle().clone();
            let root_path = handle
                .path()
                .resolve(APP_NAME, BaseDirectory::Document)
                .or_else(|_| handle.path().resolve(APP_NAME, BaseDirectory::AppData))
                .unwrap_or_else(|_| {
                    std::env::current_dir().expect("无法获取当前目录").join(APP_NAME)
                });
            
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("初始化托盘失败: {}", e);
            }
            
            tauri::async_runtime::spawn(async move {
                if let Err(e) = init_app(root_path, Some(handle)).await {
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
            upload_file_request,
            upload_file_with_extra_fields_request,
            upload_multiple_files_request,
            upload_multiple_files_with_extra_fields_request,
            post_form_data_request,
            compress_image_to_webp_command,
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
            send_p2p_audio_frame,
            send_p2p_media_config,
            send_p2p_media_control,
            send_p2p_video_call_invite,
            send_p2p_text_msg,
            close_p2p_connection,
            get_chat_record_from_store,
            get_chat_record_by_type,
            get_chat_session_from_store,
            get_friend_info,
            delete_friend_command,
            mark_read,
            get_friend_list,
            create_chat_session,
            get_system_notification,
            update_local_friend_list,
            batch_read_system_notification,
            mark_read_chat_session,
            get_local_file,
            get_file_by_biz_id,
            get_chat_file_by_biz_id,
            debug_resource_paths,
            send_image_msg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
