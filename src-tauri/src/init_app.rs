use crate::quic_service::p2p_service::p2p_stream_quic_server::udp_port_forward_ipv6;
use crate::dao::init_common_db::init_common_sqlite;
use crate::utils::global_static_str::{RESOURCE_PATH, UDP_SOCKET_V6};
use log::{info, warn};
use std::fs;
use std::net::SocketAddrV6;
use std::path::Path;

pub async fn init_app() -> Result<(), anyhow::Error> {
    // 初始化资源文件夹
    let resource_path = Path::new(RESOURCE_PATH);

    // 检查目录是否存在，不存在则新建
    if !resource_path.exists() {
        fs::create_dir(resource_path).expect("创建文件目录失败");
        info!("已创建目录: {}", RESOURCE_PATH);
    }
    // 初始化公共数据库
    init_common_sqlite().await.expect("初始化公共数据库失败!");
    let addr_v6 = "[::]:10086";
    let addr_v6_socket: SocketAddrV6 = addr_v6.parse::<SocketAddrV6>().expect("解析ipv6地址失败");
    let udp_socket_v6 = UDP_SOCKET_V6
        .parse::<SocketAddrV6>()
        .expect("解析ipv6地址失败");
    let addr_json = Vec::new();
    udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json)
        .await
        .unwrap_or_else(|x| {
            warn!("本机不支持ipv6传输 {}", x.to_string());
        });
    info!("应用启动成功");
    Ok(())
}
