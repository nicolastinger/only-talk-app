use crate::quic_service::p2p_service::p2p_stream_quic_server::{run_server, udp_port_forward};
use crate::GLOBAL_QUIC_USER_INFO;
use anyhow::anyhow;
use log::{error, info, warn};
use std::net::SocketAddr;
use tokio::net::UdpSocket;
use tokio::signal;
use tokio::time::{timeout, Duration};

pub async fn send_udp_ping_msg(
    local_addr: String,
    remote_addr: String,
) -> Result<String, anyhow::Error> {
    // let local_addr = local_addr.parse::<SocketAddr>()?;
    // let remote_addr = remote_addr.parse::<SocketAddr>()?;
    //
    // udp_port_forward(local_addr, remote_addr).await?;
    //
    // tokio::spawn(async move {
    //     tokio::time::sleep(Duration::from_millis(5)).await;
    //     get_p2p_udp_socket(local_addr)
    //         .await
    //         .expect("建立udp服务器失败");
    //     tokio::time::sleep(Duration::from_millis(5)).await;
    //     {
    //         let guard = GLOBAL_QUIC_USER_INFO.read().await;
    //         let friend_ip_port = guard
    //             .get("friend_ip_port")
    //             .expect("friend ip port not found")
    //             .clone();
    //         udp_port_forward(local_addr, friend_ip_port.parse::<SocketAddr>().expect(""))
    //             .await
    //             .expect("");
    //     }
    //
    //     tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    //     run_server(local_addr).await.expect("Failed to run server");
    // });
    Ok("Ok".to_string())
}

/// p2p通信使用udp端口
pub async fn get_p2p_udp_socket(local_addr: SocketAddr) -> anyhow::Result<()> {
    let socket = UdpSocket::bind(local_addr).await?;
    info!("服务端已启动，监听地址 {}", local_addr);

    let mut buf = [0u8; 1024];

    loop {
        tokio::select! {
            _ = signal::ctrl_c() => {
                info!("收到 Ctrl+C 信号，正在关闭服务...");
                return Ok(());
            }
            result = timeout(Duration::from_secs(120), socket.recv_from(&mut buf)) => {
                match result {
                    Ok(Ok((size, src))) => {
                        // 提取客户端信息
                        let client_ip = src.ip();
                        let client_port = src.port();

                        // TODO校验用户ip端口是否对应

                        // 转换消息为字符串（自动处理非 UTF-8 字符
                        let message = String::from_utf8_lossy(&buf[..size]);
                        {
                            let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
                            let accept_user = guard.get("accept_user").expect("accept_user not found").clone();
                            if accept_user != message {
                               warn!("用户id不一致 {} , {}", accept_user, message);
                               continue;
                            }
                        }

                        // 格式化输出客户端信息[6](@ref)
                        info!("收到来自 {}:{} 的消息：{}",
                                 client_ip,
                                 client_port,
                                 message);

                        // 清空缓冲区（避免残留数据）
                        buf[..size].fill(0);
                        {
                            let ip_port = format!("{}:{}", client_ip, client_port);
                            let mut map = GLOBAL_QUIC_USER_INFO.write().await;
                            map.insert("p2p_friend_ip_port".to_string(), ip_port);
                        }
                        return Ok(())
                    }
                    Ok(Err(e)) => error!("接收错误: {}", e),
                    Err(_) => {
                        error!("接收超时：120秒内未收到数据");
                        return Err(anyhow::anyhow!("接收超时：120秒内未收到数据"));
                    }
                }
            }
        }
    }
}
