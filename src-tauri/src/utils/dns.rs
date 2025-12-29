use anyhow::anyhow;
/// DNS解析工具函数
///
/// 提供域名解析功能，支持IPv4和IPv6地址解析。
///
/// # 示例
///
/// ```no_run
/// # use app_lib::utils::dns::{resolve_ipv4, resolve_ipv6, resolve_domain};
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// #   // 解析IPv4地址
/// #   let ipv4_addr = resolve_ipv4("example.com", 80).await?;
/// #
/// #   // 解析IPv6地址
/// #   let ipv6_addr = resolve_ipv6("example.com", 80).await?;
/// #
/// #   // 通用解析（优先IPv4）
/// #   let addr = resolve_domain("example.com", 80).await?;
/// #   Ok(())
/// # }
/// ```
use std::net::{SocketAddr, SocketAddrV4, SocketAddrV6};
use tokio::net::lookup_host;

/// 通过域名解析获取IPv4地址和端口
///
/// # Arguments
///
/// * `domain` - 要解析的域名
/// * `port` - 目标端口号
///
/// # Returns
///
/// 解析到的IPv4 Socket地址，如果解析失败则返回错误
///
/// # Examples
///
/// ```no_run
/// # use app_lib::utils::dns::resolve_ipv4;
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// #    let socket_addr = resolve_ipv4("example.com", 80).await?;
/// #    Ok(())
/// # }
/// ```
pub async fn resolve_ipv4(domain: &str, port: u16) -> Result<SocketAddrV4, anyhow::Error> {
    let host_port = format!("{}:{}", domain, port);
    let mut addrs = lookup_host(&host_port).await?;

    // 查找第一个IPv4地址
    for addr in addrs {
        if let SocketAddr::V4(addr_v4) = addr {
            return Ok(addr_v4);
        }
    }

    // 如果没有找到IPv4地址，返回错误
    Err(anyhow::anyhow!("无法解析 {} 到IPv4地址", domain))
}

/// 通过域名解析获取IPv6地址和端口
///
/// # Arguments
///
/// * `domain` - 要解析的域名
/// * `port` - 目标端口号
///
/// # Returns
///
/// 解析到的IPv6 Socket地址，如果解析失败则返回错误
///
/// # Examples
///
/// ```no_run
/// # use app_lib::utils::dns::resolve_ipv6;
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// #   let socket_addr = resolve_ipv6("example.com", 80).await?;
/// #   Ok(())
/// # }
/// ```
pub async fn resolve_ipv6(domain: &str, port: u16) -> Result<SocketAddrV6, anyhow::Error> {
    let host_port = format!("{}:{}", domain, port);
    let mut addrs = lookup_host(&host_port).await?;

    // 查找第一个IPv6地址
    for addr in addrs {
        if let SocketAddr::V6(addr_v6) = addr {
            return Ok(addr_v6);
        }
    }

    // 如果没有找到IPv6地址，返回错误
    Err(anyhow::anyhow!("无法解析 {} 到IPv6地址", domain))
}

/// 通过域名解析获取IP地址（优先IPv4）
///
/// # Arguments
///
/// * `domain` - 要解析的域名
/// * `port` - 目标端口号
///
/// # Returns
///
/// 解析到的Socket地址，优先返回IPv4地址
///
/// # Examples
///
/// ```no_run
/// # use app_lib::utils::dns::resolve_domain;
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// #   let socket_addr = resolve_domain("example.com", 80).await?;
/// #   Ok(())
/// # }
/// ```
pub async fn resolve_domain(domain: &str, port: u16) -> Result<SocketAddr, anyhow::Error> {
    let host_port = format!("{}:{}", domain, port);
    let addrs = lookup_host(&host_port).await?;

    // 优先查找IPv4地址
    for addr in addrs {
        if addr.is_ipv4() {
            return Ok(addr);
        }
    }

    // 如果没有找到IPv4地址，则返回第一个地址（可能是IPv6）
    // 注意：我们需要重新查询地址，因为上面的for循环已经消耗了迭代器
    let mut addrs = lookup_host(&host_port).await?;
    if let Some(addr) = addrs.next() {
        Ok(addr)
    } else {
        Err(anyhow::anyhow!("无法解析域名: {}", domain))
    }
}
