use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::time::Duration;

use log::warn;
use quinn::{ClientConfig, TransportConfig};
use rustls::{Certificate, RootCertStore};
use rustls_pemfile::certs;
use webpki_roots::TLS_SERVER_ROOTS;

/// 中央服务器连接配置证书
pub fn configure_client() -> ClientConfig {
    // 构建TLS配置，使用安全默认值，信任系统证书库
    let mut root_store = RootCertStore::empty();

    // 这将允许客户端验证Let's Encrypt颁发的证书
    root_store.add_trust_anchors(webpki_roots::TLS_SERVER_ROOTS.iter().map(|ta| {
        rustls::OwnedTrustAnchor::from_subject_spki_name_constraints(
            ta.subject.as_ref().to_vec(),
            ta.subject_public_key_info.as_ref().to_vec(),
            ta.name_constraints.as_ref().map(|nc| nc.as_ref().to_vec()),
        )
    }));

    // 尝试加载本地证书文件
    match File::open("config/TLS/DigiCertGlobalRootCA.crt.pem") {
        Ok(cert_file) => {
            let mut cert_file_reader = BufReader::new(cert_file);
            let ca_certs: Vec<Certificate> = certs(&mut cert_file_reader)
                .map(|certs| certs.into_iter().map(Certificate).collect())
                .map_err(|_| "无法解析证书文件")
                .expect("解析失败");

            // 添加CA证书到根证书存储
            for cert in ca_certs {
                root_store.add(&cert).expect("存储证书失败");
            }
        }
        Err(_) => {
            // 如果本地证书文件不存在，则使用系统默认根证书
            warn!("无法找到本地证书文件，使用系统默认根证书");
            root_store = RootCertStore::empty();
            root_store.roots.extend(TLS_SERVER_ROOTS.iter().map(|ta| {
                rustls::OwnedTrustAnchor::from_subject_spki_name_constraints(
                    ta.subject.as_ref(),
                    ta.subject_public_key_info.as_ref(),
                    ta.name_constraints.as_ref().map(|nc| nc.as_ref()),
                )
            }));
        }
    }

    let crypto = rustls::ClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    // 创建QUIC客户端配置
    let mut config = ClientConfig::new(Arc::new(crypto));
    let mut time_out_config = TransportConfig::default();
    time_out_config.max_idle_timeout(Some(
        Duration::from_secs(1800).try_into().expect("Duration::from_secs(1800).try_into() failed"),
    ));
    time_out_config.max_concurrent_uni_streams(32_u8.into());
    // 获取传输配置并设置最大空闲超时时间（例如3分钟）
    config.transport_config(Arc::from(time_out_config));
    config
}
