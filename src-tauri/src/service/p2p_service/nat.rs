//! NAT 端口配置与 IP 类型探测（自建 P2P 的穿透前置探测）。

use std::io;
use std::net::{SocketAddr, SocketAddrV4, SocketAddrV6, UdpSocket};
use std::sync::OnceLock;

use anyhow::anyhow;
use log::{info, warn};
use serde::Deserialize;

use crate::quic_core::p2p_service::p2p_stream_quic_server::{
    get_user_address_info, udp_port_forward, udp_port_forward_ipv6,
};
use crate::service::api_service::get_request;
use crate::utils::dns::{resolve_ipv4, resolve_ipv6};
use crate::utils::global_static_str::{talk_api_base, talk_api_domain};
use crate::GLOBAL_QUIC_USER_INFO;

/// 获取10000以上首个可用UDP端口
pub fn find_available_udp_port(start_port: u16) -> Option<u16> {
    (start_port..=65535).find(|&port| is_udp_port_available(port).unwrap_or(false))
}

/// 检查指定端口是否可用
fn is_udp_port_available(port: u16) -> io::Result<bool> {
    let addr = SocketAddrV4::new(
        "0.0.0.0"
            .parse()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Invalid IP address"))?,
        port,
    );
    match UdpSocket::bind(addr) {
        Ok(_) => Ok(true),                                           // 绑定成功，端口可用
        Err(e) if e.kind() == io::ErrorKind::AddrInUse => Ok(false), // 端口被占用
        Err(e) => Err(e),                                            // 其他错误（如权限不足）
    }
}

/// NAT UDP 端口配置(需登录后从 API 动态获取)
#[derive(Clone, Copy, Deserialize)]
pub struct NatUdpPorts {
    pub v4_port_1: u16,
    pub v6_port_1: u16,
    pub v4_port_2: u16,
    pub v6_port_2: u16,
}

static NAT_UDP_PORTS_CACHE: OnceLock<NatUdpPorts> = OnceLock::new();

/// 获取 NAT UDP 端口配置：优先进程内缓存，登录后从 API 获取。
/// 获取失败直接报错(彻底依赖动态端口，无硬编码回退)。
pub async fn get_nat_udp_ports() -> Result<NatUdpPorts, anyhow::Error> {
    if let Some(ports) = NAT_UDP_PORTS_CACHE.get() {
        return Ok(*ports);
    }

    #[derive(Deserialize)]
    struct ApiResp {
        #[allow(dead_code)]
        code: u16,
        data: NatUdpPorts,
    }

    let url = format!("{}/integrated/nat_udp_ports", talk_api_base());
    let resp = get_request(url).await.map_err(|e| anyhow!("获取NAT UDP端口失败: {}", e))?;
    let parsed: ApiResp =
        serde_json::from_str(&resp.body).map_err(|e| anyhow!("解析NAT UDP端口失败: {}", e))?;
    let _ = NAT_UDP_PORTS_CACHE.set(parsed.data);
    Ok(parsed.data)
}

/// 检测本机 IPv6 支持(NAT 发送自检)，登录成功后调用。
/// 需要动态端口，因此不依赖硬编码；失败仅记录日志，不阻断。
pub async fn check_ipv6_support() {
    let ports = match get_nat_udp_ports().await {
        Ok(p) => p,
        Err(e) => {
            info!("获取NAT UDP端口失败, 跳过IPv6检测: {}", e);
            return;
        }
    };
    let addr_v6 = "[::]:10086";
    let addr_v6_socket = match addr_v6.parse::<SocketAddrV6>() {
        Ok(addr) => addr,
        Err(e) => {
            warn!("解析ipv6地址失败: {}", e);
            return;
        }
    };
    let udp_socket_v6 = match resolve_ipv6(&talk_api_domain(), ports.v6_port_1).await {
        Ok(addr) => addr,
        Err(e) => {
            info!("域名无IPv6记录，跳过IPv6检测 {}", e);
            return;
        }
    };
    let addr_json: Vec<u8> = Vec::new();
    if let Err(e) = udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json).await {
        warn!("本机不支持ipv6传输: {}", e);
    }
}

/// 检测用户的IP类型
pub async fn check_user_ip_type() -> Result<(), anyhow::Error> {
    let nat_ports = get_nat_udp_ports().await?;
    // ipv4连接
    let udp_port = find_available_udp_port(10024).ok_or(anyhow!("no available UDP port"))?;
    let port = udp_port;
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_port_v4".to_string(), port.to_string());
    }
    let token = {
        let guard = GLOBAL_QUIC_USER_INFO.read().await;
        let token = guard.get("token").ok_or(anyhow!("no token"))?;
        token.clone()
    };

    let udp_port_v6 = find_available_udp_port(10086).ok_or(anyhow!("no available UDP port"))?;
    {
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("p2p_port_v6".to_string(), udp_port_v6.to_string());
    }
    let addr = format!("0.0.0.0:{}", udp_port);
    let mut result = get_user_address_info(addr.clone(), token).await?;
    let addr_json = serde_json::to_vec(&result)?;
    let addr_socket: SocketAddr = addr.parse()?;
    // 发送udp消息给服务器（通过DNS动态解析域名）
    let udp_socket = resolve_ipv4(&talk_api_domain(), nat_ports.v4_port_1).await?;
    let udp_socket_2 = resolve_ipv4(&talk_api_domain(), nat_ports.v4_port_2).await?;
    udp_port_forward(addr_socket, udp_socket.into(), &addr_json).await?;
    udp_port_forward(addr_socket, udp_socket_2.into(), &addr_json).await?;

    // ipv6连接
    let addr_v6 = format!("[::]:{}", udp_port_v6);
    result.ip_type = 2;
    result.address = addr_v6.clone();
    let addr_json = serde_json::to_vec(&result)?;
    let addr_v6_socket: SocketAddrV6 = addr_v6.parse::<SocketAddrV6>()?;
    // 尝试通过DNS解析IPv6地址，域名无AAAA记录时跳过（正常情况）
    if let (Ok(udp_socket_v6), Ok(udp_socket_v6_2)) = (
        resolve_ipv6(&talk_api_domain(), nat_ports.v6_port_1).await,
        resolve_ipv6(&talk_api_domain(), nat_ports.v6_port_2).await,
    ) {
        udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6, &addr_json).await.unwrap_or_else(
            |x| {
                warn!("本机不支持ipv6传输 {}", x);
            },
        );
        udp_port_forward_ipv6(addr_v6_socket, udp_socket_v6_2, &addr_json).await.unwrap_or_else(
            |x| {
                warn!("本机不支持ipv6传输 {}", x);
            },
        );
    } else {
        info!("域名无IPv6记录，跳过IPv6连接");
    }
    Ok(())
}
