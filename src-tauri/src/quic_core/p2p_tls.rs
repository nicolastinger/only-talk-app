//! P2P 会话 TLS：一次性自签名证书 + 证书指纹固定(pinning) + 首帧 token 认证。
//!
//! 隐私模式不依赖 CA：双方通过已认证的中心服务器 QUIC 通道交换会话证书，
//! 连接端只信任对端证书的 SHA-256 指纹；监听端在建连首帧校验 `request_token`。
//! 任一校验失败都直接关闭连接(失败即关闭)，不回退到不做校验的模式。

use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::{anyhow, Result};
use quinn::{ClientConfig, ServerConfig, TransportConfig};
use rustls::{
    Certificate, ClientConfig as RustlsClientConfig, PrivateKey, RootCertStore,
    ServerConfig as RustlsServerConfig,
};
use sha2::{Digest, Sha256};

use crate::utils::message_types::MSG_TYPE_P2P_AUTH;

/// 会话证书的 SAN(仅用于生成证书，实际校验走指纹)
const P2P_CERT_SAN: &str = "localhost";
/// P2P 连接空闲超时(秒)，与改造前保持一致
const P2P_IDLE_TIMEOUT_SECS: u64 = 180;

/// 生成一次性的 P2P 会话证书与私钥(PEM)。
///
/// 只用于本次隐私连接，不落盘；私钥永远不离开本机，只有证书会经中心服务器交换。
pub fn generate_p2p_identity() -> Result<(String, String)> {
    let cert = rcgen::generate_simple_self_signed(vec![P2P_CERT_SAN.to_string()])
        .map_err(|e| anyhow!("生成 P2P 自签名证书失败: {e}"))?;
    let cert_pem = cert.serialize_pem().map_err(|e| anyhow!("序列化 P2P 证书失败: {e}"))?;
    let key_pem = cert.serialize_private_key_pem();
    Ok((cert_pem, key_pem))
}

/// 解析 PEM 证书链
fn parse_cert_pem(cert_pem: &str) -> Result<Vec<Certificate>> {
    let certs = rustls_pemfile::certs(&mut cert_pem.as_bytes())
        .map_err(|e| anyhow!("解析 P2P 证书失败: {e}"))?;
    if certs.is_empty() {
        return Err(anyhow!("P2P 证书为空"));
    }
    Ok(certs.into_iter().map(Certificate).collect())
}

/// 解析 PEM 私钥(PKCS#8，rcgen 生成的即此格式)
fn parse_key_pem(key_pem: &str) -> Result<PrivateKey> {
    let mut keys = rustls_pemfile::pkcs8_private_keys(&mut key_pem.as_bytes())
        .map_err(|e| anyhow!("解析 P2P 私钥失败: {e}"))?;
    if keys.is_empty() {
        return Err(anyhow!("P2P 私钥为空或不是 PKCS#8 格式"));
    }
    Ok(PrivateKey(keys.remove(0)))
}

/// 构建 P2P 监听端 TLS 配置。
///
/// 仍然是自签名证书，但客户端会用证书指纹固定来校验，不再是"任意证书都接受"。
pub fn server_config(cert_pem: &str, key_pem: &str) -> Result<ServerConfig> {
    let certs = parse_cert_pem(cert_pem)?;
    let key = parse_key_pem(key_pem)?;

    let crypto = RustlsServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| anyhow!("构建 P2P 服务端 TLS 配置失败: {e}"))?;

    let mut config = ServerConfig::with_crypto(Arc::new(crypto));
    let mut transport = TransportConfig::default();
    transport.max_concurrent_uni_streams(0_u8.into());
    transport.max_idle_timeout(Some(
        Duration::from_secs(P2P_IDLE_TIMEOUT_SECS)
            .try_into()
            .map_err(|e| anyhow!("P2P 空闲超时配置失败: {e}"))?,
    ));
    config.transport = Arc::new(transport);

    Ok(config)
}

/// 构建 P2P 连接端 TLS 配置：只信任对端证书的 SHA-256 指纹。
pub fn client_config(peer_cert_pem: &str) -> Result<ClientConfig> {
    let certs = parse_cert_pem(peer_cert_pem)?;
    let end_entity = certs.first().ok_or_else(|| anyhow!("对端 P2P 证书为空"))?;

    let mut expected = [0_u8; 32];
    expected.copy_from_slice(&Sha256::digest(&end_entity.0));

    let mut crypto = RustlsClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(RootCertStore::empty())
        .with_no_client_auth();
    // 握手签名校验沿用 rustls 默认实现(webpki)，这里只替换证书链校验为指纹固定
    crypto.dangerous().set_certificate_verifier(Arc::new(PinnedCertVerifier { expected }));

    Ok(ClientConfig::new(Arc::new(crypto)))
}

/// 证书指纹固定校验器：只接受与预期 SHA-256 完全一致的对端证书。
struct PinnedCertVerifier {
    expected: [u8; 32],
}

impl rustls::client::ServerCertVerifier for PinnedCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &Certificate,
        _intermediates: &[Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        let actual = Sha256::digest(&end_entity.0);
        if actual.as_slice() == self.expected.as_slice() {
            Ok(rustls::client::ServerCertVerified::assertion())
        } else {
            log::error!("[p2p] 对端证书指纹不匹配, 已拒绝连接");
            Err(rustls::Error::InvalidCertificate(
                rustls::CertificateError::ApplicationVerificationFailure,
            ))
        }
    }
}

/// 校验 P2P 首帧认证消息：消息类型、双方 uuid、`request_token`(常量时间比较)。
#[allow(clippy::too_many_arguments)]
pub fn verify_auth_frame(
    text_type: u16,
    raw: &[u8],
    send_user: &str,
    recv_user: &str,
    my_uuid: &str,
    peer_uuid: &str,
    expected_token: &str,
) -> Result<()> {
    if text_type != MSG_TYPE_P2P_AUTH {
        return Err(anyhow!("P2P 认证帧类型错误: {text_type}"));
    }
    if expected_token.is_empty() {
        return Err(anyhow!("本端未保存 P2P request_token, 拒绝认证"));
    }
    if send_user != peer_uuid || recv_user != my_uuid {
        return Err(anyhow!(
            "P2P 认证帧 uuid 不匹配: send={send_user}, recv={recv_user}, 期望 send={peer_uuid}, recv={my_uuid}"
        ));
    }

    let token: String =
        serde_json::from_slice(raw).map_err(|e| anyhow!("解析 P2P 认证 token 失败: {e}"))?;
    if !constant_time_eq(token.as_bytes(), expected_token.as_bytes()) {
        return Err(anyhow!("P2P 认证 token 不匹配"));
    }

    Ok(())
}

/// 常量时间字节比较，避免通过响应时间推断 token。
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0_u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use rustls::client::ServerCertVerifier;

    use super::*;

    #[test]
    fn constant_time_eq_works() {
        assert!(constant_time_eq(b"same-token", b"same-token"));
        assert!(!constant_time_eq(b"same-token", b"other-token"));
        assert!(!constant_time_eq(b"short", b"longer"));
        assert!(constant_time_eq(b"", b""));
    }

    #[test]
    fn generated_identity_can_build_configs() {
        let (cert_pem, key_pem) = generate_p2p_identity().expect("生成证书失败");
        assert!(cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(key_pem.contains("BEGIN PRIVATE KEY"));
        server_config(&cert_pem, &key_pem).expect("构建服务端配置失败");
        client_config(&cert_pem).expect("构建客户端配置失败");
    }

    #[test]
    fn pinned_verifier_accepts_only_expected_cert() {
        let (cert_a, _) = generate_p2p_identity().expect("生成证书A失败");
        let (cert_b, _) = generate_p2p_identity().expect("生成证书B失败");

        let cert_a_der = parse_cert_pem(&cert_a).expect("解析证书A失败");
        let cert_b_der = parse_cert_pem(&cert_b).expect("解析证书B失败");

        let mut expected = [0_u8; 32];
        expected.copy_from_slice(&Sha256::digest(&cert_a_der[0].0));
        let verifier = PinnedCertVerifier { expected };

        let server_name = rustls::ServerName::try_from(P2P_CERT_SAN).expect("构造 ServerName 失败");
        let mut scts = std::iter::empty();
        assert!(verifier
            .verify_server_cert(
                &cert_a_der[0],
                &[],
                &server_name,
                &mut scts,
                &[],
                SystemTime::now(),
            )
            .is_ok());
        assert!(verifier
            .verify_server_cert(
                &cert_b_der[0],
                &[],
                &server_name,
                &mut scts,
                &[],
                SystemTime::now(),
            )
            .is_err());
    }

    #[test]
    fn verify_auth_frame_checks_every_field() {
        let token = "token-123";
        let raw = serde_json::to_vec(token).expect("序列化 token 失败");

        assert!(
            verify_auth_frame(MSG_TYPE_P2P_AUTH, &raw, "peer", "me", "me", "peer", token).is_ok()
        );

        // 类型错误
        assert!(verify_auth_frame(1, &raw, "peer", "me", "me", "peer", token).is_err());
        // send_user 不匹配
        assert!(verify_auth_frame(MSG_TYPE_P2P_AUTH, &raw, "attacker", "me", "me", "peer", token)
            .is_err());
        // recv_user 不匹配
        assert!(verify_auth_frame(MSG_TYPE_P2P_AUTH, &raw, "peer", "other", "me", "peer", token)
            .is_err());
        // token 不匹配
        assert!(verify_auth_frame(
            MSG_TYPE_P2P_AUTH,
            &raw,
            "peer",
            "me",
            "me",
            "peer",
            "other-token"
        )
        .is_err());
        // 本端没有 token
        assert!(verify_auth_frame(MSG_TYPE_P2P_AUTH, &raw, "peer", "me", "me", "peer", "").is_err());
    }
}
