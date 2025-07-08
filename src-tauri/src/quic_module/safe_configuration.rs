use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::time::Duration;
use quinn::{ClientConfig, TransportConfig};
use rustls::{Certificate, RootCertStore};
use rustls_pemfile::certs;

/// 中央服务器连接配置证书
pub fn configure_client() -> ClientConfig {
    // 构建TLS配置，使用安全默认值，信任系统证书库
    let mut root_store = RootCertStore::empty();

    let mut cert_file2 = BufReader::new(File::open("config/TLS/DigiCertGlobalRootCA.crt.pem").expect("打开pem文件失败"));
    let ca_certs:Vec<Certificate> = certs(&mut cert_file2)
        .map(|certs| certs.into_iter().map(Certificate).collect())
        .map_err(|_| "无法解析证书文件").expect("解析失败");

    // 添加CA证书到根证书存储
    for cert in ca_certs {
        root_store.add(&cert).expect("存储证书失败");
    }

    let crypto = rustls::ClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    // 创建QUIC客户端配置
    let mut config = ClientConfig::new(Arc::new(crypto));
    let mut time_out_config = TransportConfig::default();
    time_out_config.max_idle_timeout(Some(Duration::from_secs(1800).try_into().unwrap()));
    // 获取传输配置并设置最大空闲超时时间（例如3分钟）
    config.transport_config(Arc::from(time_out_config));
    config
}