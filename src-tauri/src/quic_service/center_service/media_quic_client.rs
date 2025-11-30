use log::{error, info};
use quinn::{Endpoint};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{Mutex};
use crate::quic_service::safe_configuration::configure_client;

/// 媒体流客户端
pub async fn run_video_client(server_addr: SocketAddr) -> Result<(), anyhow::Error> {
    // 创建客户端端点
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;

    // 设置默认客户端配置
    endpoint.set_default_client_config(configure_client());
    // 尝试连接到服务器
    let connection = endpoint
        .connect(server_addr, "onlytalk.local")?
        .await?;
    // 打印连接成功的服务器地址
    info!("[client] connected: addr={}", connection.remote_address());

    // 开启一个双向流
    let (send_stream, mut _recv_stream) = connection.open_bi().await?;
    // 设置优先级
    send_stream.set_priority(0)?;
    let head_length = 9;
    let buffer_msg: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    // 异步处理流中的数据
    tokio::spawn(async move {
        let mut buffer = vec![0u8; 1024 * 8];
        loop {
            match _recv_stream.read(&mut buffer).await {
                Ok(Some(length)) => {

                }
                Ok(None) => {
                    info!("[客户端]没有接收到数据");
                    break;
                }
                Err(e) => {
                    error!("[客户端] 读取错误: {}", e);
                    break;
                }
            }
        }
    });
    Ok(())
}