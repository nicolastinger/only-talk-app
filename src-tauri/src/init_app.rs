use std::fs;
use std::net::SocketAddrV6;
use std::path::{Path, PathBuf};

use chrono::Local;
use fast_log::plugin::file_split::{DateType, KeepType, Rolling, RollingType};
use fast_log::plugin::packer::LogPacker;
use fast_log::Config;
use log::{error, info, warn, LevelFilter};
use tauri::Manager;

use crate::config::set_config;
use crate::dao::init_common_db::init_common_sqlite;
use crate::quic_service::p2p_service::p2p_stream_quic_server::udp_port_forward_ipv6;
use crate::utils::global_static_str::{
    APP_PATH, DEFAULT_IMAGE, LOG_FILE_NAME, LOG_PATH, MONTHLY_RESOURCE_PATH, RESOURCE_PATH,
    SQLITE_PATH, UDP_SOCKET_V6,
};

pub async fn init_app(
    root_path: PathBuf,
    app_handle: Option<tauri::AppHandle>,
) -> Result<(), anyhow::Error> {
    // 获取应用的路径
    let app_path = root_path.to_str().expect("获取应用路径失败");
    set_config(APP_PATH, app_path);
    // 获取日志路径
    let log_dir = Path::new(app_path).join(LOG_PATH);
    println!("Android 日志路径: {:?}", log_dir);
    set_config(LOG_PATH, log_dir.to_str().expect("转换路径失败"));

    if !log_dir.exists() {
        if let Err(e) = fs::create_dir_all(&log_dir) {
            eprintln!("创建日志目录失败: {}", e);
        } else {
            println!("已创建日志目录: {:?}", log_dir);
        }
    }
    let log_file_path = log_dir.join(LOG_FILE_NAME);
    println!("Android 日志路径: {:?}", log_file_path);

    // 初始化日志
    init_log(log_file_path.to_str().expect("转换路径失败"));

    // 初始化资源文件夹
    let resource_path = Path::new(&app_path).join(RESOURCE_PATH);
    set_config(RESOURCE_PATH, resource_path.to_str().expect("转换路径失败"));

    // 检查目录是否存在，不存在则新建
    if !resource_path.exists() {
        fs::create_dir(&resource_path).expect("创建文件目录失败");
        info!("已创建目录: {}", RESOURCE_PATH);
    }

    // 检测并创建当月资源文件夹
    let monthly_folder_name = Local::now().format("%Y-%m").to_string();
    let monthly_resource_path = resource_path.join(&monthly_folder_name);
    if !monthly_resource_path.exists() {
        fs::create_dir(&monthly_resource_path).expect("创建当月资源目录失败");
        info!("已创建当月资源目录: {}", monthly_folder_name);
    } else {
        info!("当月资源目录已存在: {}", monthly_folder_name);
    }

    set_config(MONTHLY_RESOURCE_PATH, monthly_resource_path.to_str().expect("转换路径失败"));

    // 初始化sqlite文件夹
    let sqlite_path = Path::new(&app_path).join(SQLITE_PATH);
    set_config(SQLITE_PATH, sqlite_path.to_str().expect("转换路径失败"));
    if !sqlite_path.exists() {
        fs::create_dir(&sqlite_path).expect("创建文件目录失败");
        info!("已创建目录: {}", SQLITE_PATH);
    }
    // 初始化公共数据库
    init_common_sqlite(sqlite_path).await.expect("初始化公共数据库失败!");

    // 复制打包的资源文件到可访问目录（移动平台需要）
    if let Some(handle) = app_handle {
        copy_resources_to_app_dir(&handle, &resource_path).await;
    }

    // 监测ipv6是否支持
    let addr_v6 = "[::]:10086";
    let addr_v6_socket: SocketAddrV6 = addr_v6.parse::<SocketAddrV6>().expect("解析ipv6地址失败");
    let udp_socket_v6 = UDP_SOCKET_V6.parse::<SocketAddrV6>().expect("解析ipv6地址失败");
    let addr_json = Vec::new();
    udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json).await.unwrap_or_else(|x| {
        warn!("本机不支持ipv6传输 {}", x);
    });
    info!("应用启动成功");
    Ok(())
}

/// 复制打包的资源文件到应用可访问的目录
async fn copy_resources_to_app_dir(app_handle: &tauri::AppHandle, target_dir: &Path) {
    use tauri::path::BaseDirectory;

    info!("开始复制资源文件...");

    // 尝试从资源目录复制默认图片
    let resource_file_path = match app_handle
        .path()
        .resolve(&format!("{}/{}", RESOURCE_PATH, DEFAULT_IMAGE), BaseDirectory::Resource)
    {
        Ok(path) => {
            info!("解析到的资源文件路径: {:?}", path);
            path
        }
        Err(e) => {
            error!("解析资源文件路径失败: {}", e);
            return;
        }
    };

    let source_path = Path::new(&resource_file_path);
    let target_path = target_dir.join(DEFAULT_IMAGE);

    info!("源资源路径: {:?}", source_path);
    info!("目标资源路径: {:?}", target_path);
    info!("源文件是否存在: {}", source_path.exists());
    info!("目标文件是否存在: {}", target_path.exists());

    // 如果目标文件已存在，跳过复制
    if target_path.exists() {
        info!("资源文件已存在，跳过复制");
        return;
    }

    // 尝试复制文件
    if source_path.exists() {
        match fs::copy(source_path, &target_path) {
            Ok(bytes) => {
                info!("成功复制资源文件: {:?} ({} bytes)", target_path, bytes);
            }
            Err(e) => {
                error!("复制资源文件失败: {}", e);
                // 尝试列出打包目录中的文件
                if let Ok(resource_dir) =
                    app_handle.path().resolve(RESOURCE_PATH, BaseDirectory::Resource)
                {
                    info!("资源目录: {:?}", resource_dir);
                    if let Ok(entries) = fs::read_dir(&resource_dir) {
                        for entry in entries.flatten() {
                            info!("资源目录中的文件: {:?}", entry.path());
                        }
                    }
                }
            }
        }
    } else {
        error!("源资源文件不存在: {:?}", source_path);
        // 尝试列出资源目录
        if let Ok(resource_dir) = app_handle.path().resolve(RESOURCE_PATH, BaseDirectory::Resource)
        {
            info!("尝试列出资源目录: {:?}", resource_dir);
            if resource_dir.exists() {
                if let Ok(entries) = fs::read_dir(&resource_dir) {
                    for entry in entries.flatten() {
                        info!("找到文件: {:?}", entry.path());
                    }
                }
            } else {
                error!("资源目录不存在: {:?}", resource_dir);
            }
        }
    }
}

// 初始化日志
pub fn init_log(log_file_path: &str) {
    fast_log::init(
        Config::new()
            .console()
            .level(LevelFilter::Info)
            .file_split(
                log_file_path,
                Rolling::new(RollingType::ByDate(DateType::Day)),
                KeepType::KeepNum(30),
                LogPacker {},
            )
            .chan_len(Some(10)),
    )
    .expect("初始化日志失败");

    info!("日志初始化完成");
}
