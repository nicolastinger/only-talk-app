//! 会话标识派生(服务端 common::utils::session_uuid 的逐行复刻)。
//! ⚠️ 算法与 CONV_NAMESPACE 必须与服务端严格一致 —— 由 testdata 向量断言守护。

use uuid::Uuid;

/// 与服务端 config_str::CONV_NAMESPACE_STR 同值(从向量文件核对)。
pub const CONV_NAMESPACE_STR: &str = "27a23a8a-b493-4e7e-8b06-991e8d69672c";

/// 单聊会话标识: 字节序规范化 + v5 派生, 双向对称。
pub fn single_session_uuid(a: &Uuid, b: &Uuid) -> Uuid {
    let (lo, hi) = if a.as_bytes() <= b.as_bytes() { (a, b) } else { (b, a) };
    Uuid::new_v5(&namespace(), format!("{lo}:{hi}").as_bytes())
}

fn namespace() -> Uuid {
    Uuid::parse_str(CONV_NAMESPACE_STR).expect("CONV_NAMESPACE_STR 非法")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct VectorCase {
        a: String,
        b: String,
        expected: String,
    }

    #[derive(Deserialize)]
    struct Vectors {
        cases: Vec<VectorCase>,
    }

    /// ⚠️ 本测试是"两端派生一致"的唯一守护 —— 向量文件由服务端任务01产出。
    #[test]
    fn matches_server_vectors() {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/testdata/session_uuid_vectors.json"
        ))
        .expect("缺少向量文件: 从服务端仓库拷贝 src-tauri/testdata/session_uuid_vectors.json");
        let v: Vectors = serde_json::from_str(&raw).expect("向量文件格式错误");
        assert!(!v.cases.is_empty(), "向量文件不应为空");
        for c in &v.cases {
            let got = single_session_uuid(
                &Uuid::parse_str(&c.a).expect("解析 a 失败"),
                &Uuid::parse_str(&c.b).expect("解析 b 失败"),
            );
            assert_eq!(got.to_string(), c.expected, "case a={} b={}", c.a, c.b);
        }
    }

    #[test]
    fn symmetric_derivation() {
        let a = Uuid::parse_str("00000000-0000-0000-0000-000000000001").expect("解析失败");
        let b = Uuid::parse_str("00000000-0000-0000-0000-000000000002").expect("解析失败");
        assert_eq!(single_session_uuid(&a, &b), single_session_uuid(&b, &a));
    }
}