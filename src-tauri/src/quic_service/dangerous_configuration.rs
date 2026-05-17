use std::sync::Arc;
use std::time::Duration;

use quinn::{ServerConfig, TransportConfig};
use rustls::{Certificate, PrivateKey, ServerConfig as RustlsServerConfig};

pub fn configure_server() -> ServerConfig {
    // 创建一个不安全的 TLS 配置
    let crypto = RustlsServerConfig::builder().with_safe_defaults().with_no_client_auth();

    // 创建自签名证书
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()])
        .expect("generate_simple_self_signed failed");
    let cert_der = cert.serialize_der().expect("serialize_der failed");
    let key_der = cert.serialize_private_key_der();

    // 使用自签名证书
    let crypto = crypto
        .with_single_cert(vec![Certificate(cert_der)], PrivateKey(key_der))
        .expect("with_single_cert failed");

    // 创建 QUIC 服务端配置
    let mut config = ServerConfig::with_crypto(Arc::new(crypto));

    // 配置传输参数
    let mut transport_config = TransportConfig::default();
    transport_config.max_concurrent_uni_streams(0_u8.into()); // 设置最大并发单向流数量
    transport_config.max_idle_timeout(Some(
        Duration::from_secs(180).try_into().expect("Duration::from_secs(180).try_into() failed"),
    ));
    config.transport = Arc::new(transport_config);

    config
}

// 实现不安全的证书验证器
mod danger {
    use std::sync::Arc;

    use rustls::server::{ClientHello, ResolvesServerCert};
    use rustls::sign::CertifiedKey;

    #[allow(unused)]
    pub struct NoCertificateVerification {}

    impl ResolvesServerCert for NoCertificateVerification {
        fn resolve(&self, _client_hello: ClientHello) -> Option<Arc<CertifiedKey>> {
            None
        }
    }
}
