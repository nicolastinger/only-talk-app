use serde::Serialize;
use sha2::{Digest, Sha256};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Motherboard, Product, RefreshKind, System};

/// 采集到的本机设备信息
#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    /// 稳定设备指纹（SHA-256，64位小写十六进制）
    pub device_fingerprint: String,
    /// 操作系统原生的机器唯一标识
    pub machine_uid: String,
    /// CPU 型号
    pub cpu_brand: String,
    /// CPU 厂商
    pub cpu_vendor: String,
    /// 物理核心数
    pub physical_core_count: u64,
    /// 总内存（字节）
    pub total_memory_bytes: u64,
    /// 操作系统名称
    pub os_name: String,
    /// 操作系统版本
    pub os_version: String,
    /// 主机名
    pub host_name: String,
    /// 主板厂商
    pub motherboard_vendor: Option<String>,
    /// 主板型号
    pub motherboard_name: Option<String>,
    /// 主板序列号
    pub motherboard_serial: Option<String>,
    /// 整机序列号
    pub product_serial: Option<String>,
    /// 整机 UUID
    pub product_uuid: Option<String>,
    /// 网卡 MAC 地址列表（已排序去重）
    pub mac_addresses: Vec<String>,
}

/// 计算稳定设备指纹：对输入字段排序去重后做 SHA-256 摘要，返回小写十六进制
pub fn fingerprint_from_parts(parts: &[&str]) -> String {
    let mut sorted: Vec<&str> = parts.to_vec();
    sorted.sort_unstable();
    sorted.dedup();

    let mut hasher = Sha256::new();
    for part in sorted {
        hasher.update(part.len().to_string().as_bytes());
        hasher.update(b"\x00");
        hasher.update(part.as_bytes());
    }
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

/// 采集本机设备信息
pub fn collect_device_info() -> DeviceInfo {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_cpu_all();

    let cpu_brand = sys.cpus().first().map(|cpu| cpu.brand().to_string()).unwrap_or_default();
    let cpu_vendor = sys.cpus().first().map(|cpu| cpu.vendor_id().to_string()).unwrap_or_default();
    let os_name = System::name().unwrap_or_default();
    let os_version = System::os_version().unwrap_or_default();
    let host_name = System::host_name().unwrap_or_default();
    let physical_core_count = System::physical_core_count().unwrap_or(0) as u64;
    let total_memory_bytes = sys.total_memory().saturating_mul(1024);

    let motherboard = Motherboard::new();
    let motherboard_vendor = motherboard.as_ref().and_then(|m| m.vendor_name());
    let motherboard_name = motherboard.as_ref().and_then(|m| m.name());
    let motherboard_serial = motherboard.as_ref().and_then(|m| m.serial_number());
    let product_serial = Product::serial_number();
    let product_uuid = Product::uuid();

    let machine_uid = machine_uid::get().unwrap_or_default();

    let mut mac_addresses: Vec<String> = mac_address::MacAddressIterator::new()
        .map(|iter| iter.map(|mac| mac.to_string()).collect())
        .unwrap_or_default();
    mac_addresses.sort();
    mac_addresses.dedup();

    let mut parts = vec![
        machine_uid.clone(),
        cpu_brand.clone(),
        cpu_vendor.clone(),
        host_name.clone(),
        motherboard_serial.clone().unwrap_or_default(),
        product_serial.clone().unwrap_or_default(),
        product_uuid.clone().unwrap_or_default(),
    ];
    parts.extend(mac_addresses.clone());
    let parts_refs: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    let device_fingerprint = fingerprint_from_parts(&parts_refs);

    DeviceInfo {
        device_fingerprint,
        machine_uid,
        cpu_brand,
        cpu_vendor,
        physical_core_count,
        total_memory_bytes,
        os_name,
        os_version,
        host_name,
        motherboard_vendor,
        motherboard_name,
        motherboard_serial,
        product_serial,
        product_uuid,
        mac_addresses,
    }
}

/// 返回稳定设备指纹哈希
pub fn device_fingerprint() -> String {
    collect_device_info().device_fingerprint
}
