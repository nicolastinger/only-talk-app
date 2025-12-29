use quinn::{ServerConfig, TransportConfig};
use rcgen;
use rustls::{Certificate, PrivateKey, ServerConfig as RustlsServerConfig};
use std::sync::Arc;
use std::time::Duration;

pub fn configure_server() -> ServerConfig {
    // 创建一个不安全的 TLS 配置
    let mut crypto = RustlsServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth();

    // 创建自签名证书
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let cert_der = cert.serialize_der().unwrap();
    let key_der = cert.serialize_private_key_der();

    // 使用自签名证书
    let crypto = crypto
        .with_single_cert(vec![Certificate(cert_der)], PrivateKey(key_der))
        .unwrap();

    // 创建 QUIC 服务端配置
    let mut config = ServerConfig::with_crypto(Arc::new(crypto));

    // 配置传输参数
    let mut transport_config = TransportConfig::default();
    transport_config.max_concurrent_uni_streams(0_u8.into()); // 设置最大并发单向流数量
    transport_config.max_idle_timeout(Some(Duration::from_secs(180).try_into().unwrap()));
    config.transport = Arc::new(transport_config);

    config
}

// 实现不安全的证书验证器
mod danger {
    use rustls::server::ClientHello;
    use rustls::server::ResolvesServerCert;
    use rustls::sign::CertifiedKey;
    use std::sync::Arc;

    pub struct NoCertificateVerification {}

    impl ResolvesServerCert for NoCertificateVerification {
        fn resolve(&self, _client_hello: ClientHello) -> Option<Arc<CertifiedKey>> {
            None
        }
    }
}
