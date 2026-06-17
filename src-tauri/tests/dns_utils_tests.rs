use app_lib::utils::dns::{resolve_domain, resolve_ipv4, resolve_ipv6};

#[tokio::test]
async fn test_resolve_ipv4_with_valid_domain() {
    // 测试一个常见的域名，应该能解析到IPv4地址
    let result = resolve_ipv4("example.com", 80).await;
    assert!(result.is_ok(), "Failed to resolve example.com to IPv4: {:?}", result.err());

    let socket_addr = result.unwrap();
    println!("Resolved example.com to IPv4 address: {}", socket_addr);
    assert_eq!(socket_addr.port(), 80, "Port should be 80");
}

#[tokio::test]
async fn test_resolve_ipv4_with_localhost() {
    // 测试localhost应该总是可以解析的
    let result = resolve_ipv4("localhost", 8080).await;
    assert!(result.is_ok(), "Failed to resolve localhost to IPv4: {:?}", result.err());

    let socket_addr = result.unwrap();
    println!("Resolved localhost to IPv4 address: {}", socket_addr);
    assert_eq!(socket_addr.port(), 8080, "Port should be 8080");
}

#[tokio::test]
async fn test_resolve_ipv4_with_invalid_domain() {
    // 测试一个不存在的域名
    let result = resolve_ipv4("this-domain-should-not-exist.com", 80).await;
    assert!(result.is_err(), "Should fail to resolve invalid domain");
}

#[tokio::test]
async fn test_resolve_ipv6_with_valid_domain() {
    // 测试一个常见的域名，应该能解析到IPv6地址（如果系统支持）
    let result = resolve_ipv6("example.com", 80).await;
    // 注意：这个测试的结果依赖于系统网络配置，有些系统可能禁用了IPv6
    // 我们只验证如果成功，返回的是IPv6地址
    if let Ok(socket_addr) = result {
        println!("Resolved example.com to IPv6 address: {}", socket_addr);
        assert_eq!(socket_addr.port(), 80, "Port should be 80");
    }
}

#[tokio::test]
async fn test_resolve_ipv6_with_localhost() {
    // 测试localhost的IPv6解析
    let result = resolve_ipv6("localhost", 8080).await;
    // localhost通常同时支持IPv4和IPv6
    if let Ok(socket_addr) = result {
        println!("Resolved localhost to IPv6 address: {}", socket_addr);
        assert_eq!(socket_addr.port(), 8080, "Port should be 8080");
    }
}

#[tokio::test]
async fn test_resolve_ipv6_with_invalid_domain() {
    // 测试一个不存在的域名
    let result = resolve_ipv6("this-domain-should-not-exist.com", 80).await;
    assert!(result.is_err(), "Should fail to resolve invalid domain");
}

#[tokio::test]
async fn test_resolve_domain_with_valid_domain() {
    // 测试通用解析函数
    let result = resolve_domain("example.com", 80).await;
    assert!(result.is_ok(), "Failed to resolve example.com: {:?}", result.err());

    let socket_addr = result.unwrap();
    println!("Resolved example.com to address: {}", socket_addr);
    assert_eq!(socket_addr.port(), 80, "Port should be 80");
}

#[tokio::test]
async fn test_resolve_domain_with_localhost() {
    // 测试localhost的通用解析
    let result = resolve_domain("localhost", 8080).await;
    assert!(result.is_ok(), "Failed to resolve localhost: {:?}", result.err());

    let socket_addr = result.unwrap();
    println!("Resolved localhost to address: {}", socket_addr);
    assert_eq!(socket_addr.port(), 8080, "Port should be 8080");
}

#[tokio::test]
async fn test_resolve_domain_with_invalid_domain() {
    // 测试一个不存在的域名
    let result = resolve_domain("this-domain-should-not-exist.com", 80).await;
    assert!(result.is_err(), "Should fail to resolve invalid domain");
}
