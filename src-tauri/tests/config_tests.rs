#![cfg(test)]

//! config 模块单元测试(基于进程级 GLOBAL_CONFIG)。
//!
//! 所有用例共享同一份全局配置，故用互斥锁串行化，避免并行互相清空/覆盖。

use std::sync::{Mutex, MutexGuard};

use app_lib::config::{
    clear_all_configs, config_count, export_config_to_json, get_all_configs, get_config,
    get_config_bool, get_config_bool_or_default, get_config_i64, get_config_i64_or_default,
    get_config_json, has_config, import_config_from_json, remove_config, set_config,
    set_config_batch, set_config_if_missing, set_config_json,
};

static CONFIG_LOCK: Mutex<()> = Mutex::new(());

fn config_guard() -> MutexGuard<'static, ()> {
    CONFIG_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[test]
fn config_set_get_remove() {
    let _guard = config_guard();
    clear_all_configs();
    assert!(!has_config("k1"));
    set_config("k1", "v1");
    assert!(has_config("k1"));
    assert_eq!(get_config("k1").as_deref(), Some("v1"));
    remove_config("k1");
    assert!(!has_config("k1"));
    assert_eq!(get_config("k1"), None);
}

#[test]
fn config_typed_accessors() {
    let _guard = config_guard();
    clear_all_configs();
    assert_eq!(get_config_i64("n"), None);
    assert_eq!(get_config_i64_or_default("n", 7), 7);

    set_config("n", "42");
    assert_eq!(get_config_i64("n"), Some(42));
    assert_eq!(get_config_i64_or_default("n", 7), 42);

    set_config("b", "true");
    assert_eq!(get_config_bool("b"), Some(true));
    assert!(get_config_bool_or_default("b", false));

    assert_eq!(get_config_bool("invalid"), None);
}

#[test]
fn config_json_roundtrip() {
    let _guard = config_guard();
    clear_all_configs();
    let value: serde_json::Value =
        serde_json::from_str(r#"{"a":1,"b":[1,2],"c":{"d":true}}"#).expect("构造 JSON 失败");
    set_config_json("j", &value).expect("序列化 JSON 失败");
    let back: serde_json::Value = get_config_json("j").expect("反序列化失败").expect("配置不存在");
    assert_eq!(back, value);

    assert!(get_config_json::<serde_json::Value>("missing").expect("查询失败").is_none());
}

#[test]
fn config_batch_and_count() {
    let _guard = config_guard();
    clear_all_configs();
    set_config_batch(&[("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())]);
    assert_eq!(config_count(), 2);
    let all = get_all_configs();
    assert_eq!(all.len(), 2);
    assert!(all.iter().any(|(k, v)| k == "a" && v == "1"));

    clear_all_configs();
    assert_eq!(config_count(), 0);
}

#[test]
fn config_import_export_roundtrip() {
    let _guard = config_guard();
    clear_all_configs();
    set_config("x", "1");
    set_config("y", "hello");
    let json = export_config_to_json();

    clear_all_configs();
    import_config_from_json(&json).expect("导入失败");
    assert_eq!(get_config("x").as_deref(), Some("1"));
    assert_eq!(get_config("y").as_deref(), Some("hello"));

    assert!(import_config_from_json("not-json").is_err());
    assert!(import_config_from_json("[]").is_err());
}

#[test]
fn config_set_if_missing() {
    let _guard = config_guard();
    clear_all_configs();
    set_config_if_missing("k", "default");
    set_config_if_missing("k", "overwrite");
    assert_eq!(get_config("k").as_deref(), Some("default"));
}

#[test]
fn config_import_accepts_json_object() {
    let _guard = config_guard();
    clear_all_configs();
    import_config_from_json(r#"{"host":"localhost","port":"8443"}"#).expect("导入失败");
    assert_eq!(get_config("host").as_deref(), Some("localhost"));
    assert_eq!(get_config("port").as_deref(), Some("8443"));
}
