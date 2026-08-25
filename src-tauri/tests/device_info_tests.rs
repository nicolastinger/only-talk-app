use app_lib::utils::device_info::{
    collect_device_info, device_fingerprint, fingerprint_from_parts,
};

#[test]
fn test_fingerprint_deterministic() {
    let parts = ["machine-a", "cpu-model-x", "00:11:22:33:44:55"];
    let first = fingerprint_from_parts(&parts);
    let second = fingerprint_from_parts(&parts);
    assert_eq!(first, second);
}

#[test]
fn test_fingerprint_changes_with_input() {
    let a = fingerprint_from_parts(&["machine-a", "00:11:22:33:44:55"]);
    let b = fingerprint_from_parts(&["machine-b", "00:11:22:33:44:55"]);
    assert_ne!(a, b);
}

#[test]
fn test_fingerprint_order_insensitive() {
    let a = fingerprint_from_parts(&["machine-a", "00:11:22:33:44:55", "cpu-x"]);
    let b = fingerprint_from_parts(&["cpu-x", "00:11:22:33:44:55", "machine-a"]);
    assert_eq!(a, b);
}

#[test]
fn test_fingerprint_duplicate_input_deduped() {
    let a = fingerprint_from_parts(&["machine-a", "machine-a", "00:11:22:33:44:55"]);
    let b = fingerprint_from_parts(&["machine-a", "00:11:22:33:44:55"]);
    assert_eq!(a, b);
}

#[test]
fn test_fingerprint_is_64_hex_chars() {
    let fingerprint = fingerprint_from_parts(&["machine-a"]);
    assert_eq!(fingerprint.len(), 64);
    assert!(fingerprint.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn test_collect_device_info_basic() {
    let info = collect_device_info();
    assert_eq!(info.device_fingerprint.len(), 64);
    assert!(!info.machine_uid.is_empty(), "machine_uid 应该能获取到");
}

#[test]
fn test_device_fingerprint_stable() {
    let a = device_fingerprint();
    let b = device_fingerprint();
    assert_eq!(a, b);
}

#[test]
fn test_device_info_serializable() {
    let info = collect_device_info();
    let json = serde_json::to_string(&info).expect("DeviceInfo 应可序列化为 JSON");
    assert!(json.contains(&info.device_fingerprint));
    assert!(json.contains("motherboard_serial"));
}