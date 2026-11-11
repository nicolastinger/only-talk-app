//! JWT payload 解析(不校验签名)。
//!
//! 仅本地读取 access_token 中的声明(如会话 `jti`), 不校验签名、不信任其来源。

use crate::GLOBAL_QUIC_USER_INFO;

/// 当前 access_token 中携带的会话 jti。
///
/// 仅 base64url 解析 payload、不校验签名, 用于识别强退帧是否来自本机当前会话。
pub async fn current_token_jti() -> Option<String> {
    let token = GLOBAL_QUIC_USER_INFO.read().await.get("token").cloned()?;
    decode_token_jti(&token)
}

/// 解析 JWT 的 payload 中的 `jti` 字段。
pub fn decode_token_jti(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let bytes = decode_base64url(payload)?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("jti")?.as_str().map(|s| s.to_string())
}

/// 无填充 base64url 解码(仅用于解析 JWT payload 片段)。
pub fn decode_base64url(input: &str) -> Option<Vec<u8>> {
    let decode_table = |c: u8| -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'-' => Some(62),
            b'_' => Some(63),
            _ => None,
        }
    };
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits: u8 = 0;
    for byte in input.bytes() {
        let value = decode_table(byte)?;
        acc = (acc << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1u32 << bits) - 1;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_token_jti_reads_payload() {
        // payload = {"jti":"abc"}
        let token = "header.eyJqdGkiOiJhYmMifQ.signature";
        assert_eq!(decode_token_jti(token).as_deref(), Some("abc"));
    }

    #[test]
    fn decode_token_jti_rejects_invalid() {
        assert_eq!(decode_token_jti("no-dots"), None);
        assert_eq!(decode_token_jti("a.@@@.c"), None);
    }

    #[test]
    fn decode_base64url_roundtrip_bytes() {
        // {"jti":"abc"} == 7b 22 6a 74 69 22 3a 22 61 62 63 22 7d
        assert_eq!(
            decode_base64url("eyJqdGkiOiJhYmMifQ").as_deref(),
            Some(br#"{"jti":"abc"}"#.as_slice())
        );
    }
}
