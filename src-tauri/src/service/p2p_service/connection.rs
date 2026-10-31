//! 自建 P2P 连接的建立/接受/拒绝、服务端/客户端运行与资源清理。

use std::time::Duration;

use anyhow::anyhow;
use log::{error, info};
use nanoid::nanoid;

use super::nat::check_user_ip_type;
use crate::models::bo::p2p_models::{P2pInitMsg, P2pMsg, UserAddressInfo};
use crate::models::bo::text_msg::TextQuicMsg;
use crate::quic_core::center_service::text_msg_service::generate_text_msg;
use crate::quic_core::p2p::client::run_client;
use crate::quic_core::p2p::server::{run_server, udp_port_forward};
use crate::quic_core::p2p_tls::generate_p2p_identity;
use crate::utils::events;
use crate::utils::message_types::{MSG_TYPE_P2P, P2P_ACCEPT_REQUEST};
use crate::{GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO};

/// 发送p2p初始化信息
pub async fn send_p2p_init_msg(accept_user: String) -> Result<(), anyhow::Error> {
    let (sender, request_token) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let sender = guard.get("uuid").ok_or(anyhow!("no sender"))?.clone();
        // 请求标识符
        let request_token = nanoid!();
        (sender, request_token)
    };

    // 本次 P2P 会话的临时证书(私钥只留在本机，证书随 init 消息经中心服务器交换)
    let (cert_pem, key_pem) = generate_p2p_identity()?;

    // 本机作为服务端

    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_server_model".to_string(), "server".to_string());
        guard.insert("p2p_request_token".to_string(), request_token.clone());
        guard.insert("target_uuid".to_string(), accept_user.clone());
        guard.insert("p2p_local_cert_pem".to_string(), cert_pem.clone());
        guard.insert("p2p_local_key_pem".to_string(), key_pem);
        guard.remove("p2p_peer_cert_pem");
    }

    let p2p_init_msg = P2pInitMsg {
        accept_addr: "".to_string(),
        request_addr: "".to_string(),
        request_uuid: sender.clone(),
        accept_uuid: accept_user.clone(),
        request_token,
        accept: false,
        ip_type: 0,
        step: 0,
        is_server: false,
        request_cert: cert_pem,
        accept_cert: String::new(),
    };
    let p2p_msg =
        generate_text_msg(MSG_TYPE_P2P, serde_json::to_vec(&p2p_init_msg)?, accept_user, sender)?;

    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.conn.clone()
    };
    let mut send = conn.open_uni().await?;
    send.write_all(&p2p_msg).await?;
    send.finish().await?;
    Ok(())
}

/// 拒绝用户的p2p请求
pub async fn reject_p2p_request(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    let me = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let uuid = guard.get("uuid").ok_or(anyhow!("no uuid"))?;
        uuid.clone()
    };
    let p2p_msg = generate_text_msg(
        MSG_TYPE_P2P,
        serde_json::to_vec(&p2p_init_msg)?,
        p2p_init_msg.request_uuid,
        me,
    )?;
    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.conn.clone()
    };
    let mut send = conn.open_uni().await?;
    send.write_all(&p2p_msg).await?;
    send.finish().await?;

    Ok(())
}

/// 接受用户的p2p请求
pub async fn access_p2p_request(mut p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    let uuid = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let uuid = guard.get("uuid").ok_or(anyhow!("no uuid"))?;
        uuid.clone()
    };

    // 对端证书缺失直接拒绝(老版本客户端不支持指纹固定，不能静默降级)
    let peer_cert_pem = p2p_init_msg.request_cert.trim().to_string();
    if peer_cert_pem.is_empty() {
        return Err(anyhow!("对端未提供 P2P 证书, 无法建立安全连接"));
    }

    // 生成本次会话的临时证书，回传给发起方做指纹固定
    let (cert_pem, key_pem) = generate_p2p_identity()?;

    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("target_uuid".to_string(), p2p_init_msg.request_uuid.clone());
        guard.insert("p2p_request_token".to_string(), p2p_init_msg.request_token.clone());
        guard.insert("p2p_local_cert_pem".to_string(), cert_pem.clone());
        guard.insert("p2p_local_key_pem".to_string(), key_pem);
        guard.insert("p2p_peer_cert_pem".to_string(), peer_cert_pem);
    }
    p2p_init_msg.accept_cert = cert_pem;

    check_user_ip_type().await?;

    let p2p_msg = generate_text_msg(
        MSG_TYPE_P2P,
        serde_json::to_vec(&p2p_init_msg)?,
        p2p_init_msg.request_uuid.clone(),
        uuid,
    )?;
    // 发送确认接收信息给服务器
    let conn = {
        let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
        server_book.get("SERVER_TEXT").ok_or(anyhow!("找不到连接"))?.conn.clone()
    };
    let mut send = conn.open_uni().await?;
    send.write_all(&p2p_msg).await?;
    send.finish().await?;
    info!("发送接收信息");
    Ok(())
}

/// 建立p2p服务端
pub async fn run_p2p_server(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let target_address_info: UserAddressInfo = serde_json::from_slice(&text_quic_msg.raw)?;
    // 打开视频窗口
    let p2p_msg = P2pMsg { r#type: P2P_ACCEPT_REQUEST, raw: target_address_info.uuid.clone() };
    events::emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
    tokio::spawn(async move {
        info!("收到 {:?}", target_address_info);
        // 开启ipv4服务端
        if target_address_info.ip_type == 1 {
            if let Err(e) = run_p2p_serer_v4(target_address_info).await {
                error!("运行ipv4版本p2p服务端失败: {}", e);
            }
        }
    });
    Ok(())
}

/// 建立p2p客户端
pub async fn run_p2p_client(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    tokio::spawn(async move {
        let target_address_info =
            match serde_json::from_slice::<UserAddressInfo>(&text_quic_msg.raw) {
                Ok(info) => info,
                Err(e) => {
                    error!("解析 P2P 客户端地址信息失败: {}", e);
                    return;
                }
            };
        info!("收到 {:?}", target_address_info);
        // 开启ipv4客户端
        if target_address_info.ip_type == 1 {
            if let Err(e) = run_p2p_client_v4(target_address_info).await {
                error!("创建ipv4版p2p客户失败: {}", e);
            }
        }
    });
    Ok(())
}

/// 创建ipv4服务端
async fn run_p2p_serer_v4(target_address_info: UserAddressInfo) -> Result<(), anyhow::Error> {
    let (port, cert_pem, key_pem, expected_token) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let port = guard.get("p2p_port_v4").ok_or(anyhow!("no p2p port"))?.clone();
        let cert_pem = guard.get("p2p_local_cert_pem").ok_or(anyhow!("no p2p cert"))?.clone();
        let key_pem = guard.get("p2p_local_key_pem").ok_or(anyhow!("no p2p key"))?.clone();
        let expected_token = guard.get("p2p_request_token").ok_or(anyhow!("no p2p token"))?.clone();
        (port, cert_pem, key_pem, expected_token)
    };
    let addr = format!("0.0.0.0:{}", port);
    let vec_to = Vec::new();
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    run_server(addr.parse()?, cert_pem, key_pem, expected_token).await?;
    Ok(())
}

/// 等待对端证书就位(accept 消息与 NAT 匹配消息可能乱序到达)
async fn wait_for_peer_cert(timeout: Duration) -> Option<String> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let cert = {
            let guard = GLOBAL_QUIC_USER_INFO.read().await;
            guard.get("p2p_peer_cert_pem").cloned()
        };
        if let Some(cert) = cert.filter(|c| !c.trim().is_empty()) {
            return Some(cert);
        }
        if tokio::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

/// 运行ipv4客户端
async fn run_p2p_client_v4(target_address_info: UserAddressInfo) -> Result<(), anyhow::Error> {
    let port = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        guard.get("p2p_port_v4").ok_or(anyhow!("no p2p port"))?.clone()
    };
    // accept 消息与 NAT 匹配消息可能乱序到达，这里短暂等待对端证书就位
    let peer_cert_pem =
        wait_for_peer_cert(Duration::from_secs(2)).await.ok_or(anyhow!("no peer p2p cert"))?;
    let addr = format!("0.0.0.0:{}", port);
    let vec_to = Vec::new();
    // 发送一次udp消息给客户端
    udp_port_forward(addr.parse()?, target_address_info.address.to_string().parse()?, &vec_to)
        .await?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    run_client(addr.parse()?, target_address_info.address.to_string().parse()?, peer_cert_pem)
        .await?;
    Ok(())
}

/// 关闭p2p连接，清理资源
pub async fn close_p2p_connection_service(target_uuid: String) -> Result<(), anyhow::Error> {
    info!("关闭p2p连接: {}", target_uuid);

    // 设置p2p连接状态为非活跃，停止ping消息
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_active".to_string(), "false".to_string());
    }

    // 从P2P_STREAM_SENDER中移除该用户的所有channel
    {
        if let Some((_, user_channels)) = crate::P2P_STREAM_SENDER.remove(&target_uuid) {
            // 关闭所有channel的发送流
            for (_, stream) in user_channels {
                let _ = stream.send_stream.lock().await.finish().await;
                info!("已关闭p2p发送流: {} channel: {}", target_uuid, stream.channel_type);
            }
            info!("已移除用户 {} 的所有p2p发送流", target_uuid);
        }
    }

    // 清理 P2P 媒体接收 Channel（前端窗口关闭后不再需要）
    {
        if crate::P2P_MEDIA_CHANNELS.remove(&target_uuid).is_some() {
            info!("已移除用户 {} 的P2P媒体接收Channel", target_uuid);
        }
    }

    // 清理 P2P 媒体发送队列（触发消费者任务退出）
    {
        if crate::P2P_MEDIA_SEND_QUEUES.remove(&target_uuid).is_some() {
            info!("已移除用户 {} 的P2P媒体发送队列", target_uuid);
        }
    }

    // 清理GLOBAL_QUIC_USER_INFO中的相关数据
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.remove("p2p_server_model");
        guard.remove("p2p_request_token");
        guard.remove("target_uuid");
        guard.remove("p2p_port_v4");
        guard.remove("p2p_port_v6");
        guard.remove("p2p_local_cert_pem");
        guard.remove("p2p_local_key_pem");
        guard.remove("p2p_peer_cert_pem");
    }

    // 停止MediaData通道的接收循环
    {
        let guard = crate::MEDIA_DATA_CANCEL_TOKEN.read().await;
        if let Some(token) = guard.as_ref() {
            info!("触发MediaData通道取消令牌（关闭P2P连接）");
            token.cancel();
        }
    }

    info!("p2p连接资源清理完成");
    Ok(())
}

/// 接收p2p连接请求，向前端发起p2p建立请求
pub async fn process_p2p_msg(p2p_init_msg: P2pInitMsg) -> Result<(), anyhow::Error> {
    // 判断自己是否为发起人,接收人
    info!("process_p2p_msg {:?}", p2p_init_msg);
    let (is_me, req_me) = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let me = guard.get("uuid").ok_or_else(|| anyhow!("uuid not found"))?.clone();
        (p2p_init_msg.request_uuid == me, p2p_init_msg.accept_uuid == me)
    };
    info!("is_me: {}, req_me: {}", is_me, req_me);
    match (is_me, req_me) {
        (true, true) => {
            error!("自己不能给自己发请求");
        }
        (true, false) => {
            // 接收用户返回的信息
            match p2p_init_msg.accept {
                true => {
                    // 开始处理p2p通道连接
                    if 2 == p2p_init_msg.step {
                        // 保存对端证书，用于连接时做指纹固定
                        let peer_cert_pem = p2p_init_msg.accept_cert.trim().to_string();
                        if peer_cert_pem.is_empty() {
                            error!("对端未提供 P2P 证书, 拒绝建立连接");
                            return Err(anyhow!("对端未提供 P2P 证书, 无法建立安全连接"));
                        }
                        {
                            let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
                            guard.insert("p2p_peer_cert_pem".to_string(), peer_cert_pem);
                        }
                        // 探索本机的ip类型
                        check_user_ip_type().await?;
                    }
                }
                // 用户拒绝建立连接
                false => {
                    let p2p_msg =
                        P2pMsg { r#type: 104, raw: serde_json::to_string(&p2p_init_msg)? };
                    events::emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
                }
            }
        }
        (false, true) => {
            // 接收到p2p请求
            // 发送数据给前端
            let p2p_msg = P2pMsg { r#type: 102, raw: serde_json::to_string(&p2p_init_msg)? };
            events::emit("listen_p2p_request", serde_json::to_string(&p2p_msg)?)?;
        }
        (false, false) => {
            error!("发错人了")
        }
    }
    Ok(())
}
