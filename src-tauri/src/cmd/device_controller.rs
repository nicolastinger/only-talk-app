use tauri::command;

use crate::utils::device_info::{collect_device_info, DeviceInfo};

/// 获取本机设备信息（CPU、主板、网卡等）
#[command]
pub fn get_device_info() -> Result<DeviceInfo, String> {
    Ok(collect_device_info())
}
