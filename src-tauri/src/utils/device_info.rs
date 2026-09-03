use serde::Serialize;
use sha2::{Digest, Sha256};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Motherboard, Product, RefreshKind, System};

/// 桌面/BSD/illumos 平台：machine-uid 支持列表，直接使用该 crate
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_machine_id() -> String {
    machine_uid::get().unwrap_or_default()
}

/// Android：machine-uid 不支持移动端(无法编译)，改用系统属性构造稳定机器标识
#[cfg(target_os = "android")]
fn get_machine_id() -> String {
    platform_machine_id::get()
}

/// iOS 等其余移动端：暂无原生机器唯一标识，返回空串由其它字段兜底
#[cfg(all(not(target_os = "android"), target_os = "ios"))]
fn get_machine_id() -> String {
    String::new()
}

#[cfg(target_os = "android")]
mod platform_machine_id {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_int};

    #[link(name = "android")]
    extern "C" {
        fn __system_property_get(name: *const c_char, value: *mut c_char) -> c_int;
    }

    fn get_prop(name: &str) -> Option<String> {
        let c_name = CString::new(name).ok()?;
        let mut buf = [0 as c_char; 128];
        let len = unsafe { __system_property_get(c_name.as_ptr(), buf.as_mut_ptr()) };
        if len <= 0 {
            return None;
        }
        let slice = unsafe {
            std::slice::from_raw_parts(buf.as_ptr() as *const u8, len as usize)
        };
        Some(String::from_utf8_lossy(slice).into_owned())
    }

    /// 优先 ro.serialno，缺失时回退 ro.build.fingerprint
    pub fn get() -> String {
        get_prop("ro.serialno")
            .or_else(|| get_prop("ro.build.fingerprint"))
            .unwrap_or_default()
    }
}

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

    let machine_uid = get_machine_id();

    let parts: Vec<String> = [
        machine_uid.clone(),
        cpu_brand.clone(),
        cpu_vendor.clone(),
        host_name.clone(),
        motherboard_serial.clone().unwrap_or_default(),
        product_serial.clone().unwrap_or_default(),
        product_uuid.clone().unwrap_or_default(),
    ]
    .into_iter()
    .filter(|v| !v.is_empty())
    .collect();
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
    }
}

/// 返回稳定设备指纹哈希
pub fn device_fingerprint() -> String {
    collect_device_info().device_fingerprint
}
