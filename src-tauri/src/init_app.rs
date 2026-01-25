use std::fs;
use std::net::SocketAddrV6;
use std::path::{Path, PathBuf};

use fast_log::plugin::file_split::{DateType, KeepType, Rolling, RollingType};
use fast_log::plugin::packer::LogPacker;
use fast_log::Config;
use log::{info, warn, LevelFilter};

use crate::config::set_config;
use crate::dao::init_common_db::init_common_sqlite;
use crate::quic_service::p2p_service::p2p_stream_quic_server::udp_port_forward_ipv6;
use crate::utils::global_static_str::{
    APP_PATH, LOG_FILE_NAME, LOG_PATH, RESOURCE_PATH, SQLITE_PATH, UDP_SOCKET_V6,
};

pub async fn init_app(root_path: PathBuf) -> Result<(), anyhow::Error> {
    // 获取应用的路径
    let app_path = root_path.to_str().expect("获取应用路径失败");
    set_config(APP_PATH, app_path);
    // 获取日志路径
    let log_dir = Path::new(app_path).join(LOG_PATH);

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

    // 检查目录是否存在，不存在则新建
    if !resource_path.exists() {
        fs::create_dir(&resource_path).expect("创建文件目录失败");
        info!("已创建目录: {}", RESOURCE_PATH);
    }

    // 初始化sqlite文件夹
    let sqlite_path = Path::new(&app_path).join(SQLITE_PATH);
    if !sqlite_path.exists() {
        fs::create_dir(&sqlite_path).expect("创建文件目录失败");
        info!("已创建目录: {}", SQLITE_PATH);
    }
    // 初始化公共数据库
    init_common_sqlite(sqlite_path).await.expect("初始化公共数据库失败!");

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
