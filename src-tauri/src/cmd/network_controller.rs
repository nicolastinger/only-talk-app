use tauri::command;

/// 当前网络接入类型，用于「WiFi 下自动下载」的判定：
/// - `wifi`：无线局域网
/// - `ethernet`：有线网络（桌面端视为非计量网络）
/// - `cellular`：移动蜂窝数据（按非 WiFi 处理，不自动下载）
/// - `offline`：无活动网络
/// - `unknown`：无法判定
#[command]
pub fn get_network_type() -> Result<String, String> {
    Ok(detect_network_type().to_string())
}

/// Android：通过 ConnectivityManager 查询当前活动网络的传输类型。
#[cfg(target_os = "android")]
fn detect_network_type() -> &'static str {
    // ndk_context 未初始化时会 panic，这里兜底避免影响前端
    std::panic::catch_unwind(android_network_type).ok().flatten().unwrap_or("unknown")
}

#[cfg(target_os = "android")]
fn android_network_type() -> Option<&'static str> {
    use jni::objects::{JObject, JValue};
    use jni::JavaVM;

    // android.net.NetworkCapabilities 传输类型常量
    const TRANSPORT_CELLULAR: i32 = 0;
    const TRANSPORT_WIFI: i32 = 1;
    const TRANSPORT_ETHERNET: i32 = 3;

    let ctx = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.ok()?;
    let mut env = vm.attach_current_thread().ok()?;

    let context = unsafe { JObject::from_raw(ctx.context() as jni::sys::jobject) };

    let service_name = env.new_string("connectivity").ok()?;
    let service = JObject::from(service_name);
    let cm = env
        .call_method(
            &context,
            "getSystemService",
            "(Ljava/lang/String;)Ljava/lang/Object;",
            &[JValue::Object(&service)],
        )
        .ok()?
        .l()
        .ok()?;
    if cm.is_null() {
        return None;
    }

    let network =
        env.call_method(&cm, "getActiveNetwork", "()Landroid/net/Network;", &[]).ok()?.l().ok()?;
    if network.is_null() {
        return Some("offline");
    }

    let caps = env
        .call_method(
            &cm,
            "getNetworkCapabilities",
            "(Landroid/net/Network;)Landroid/net/NetworkCapabilities;",
            &[JValue::Object(&network)],
        )
        .ok()?
        .l()
        .ok()?;
    if caps.is_null() {
        return None;
    }

    let has_wifi = env
        .call_method(&caps, "hasTransport", "(I)Z", &[JValue::Int(TRANSPORT_WIFI)])
        .ok()
        .and_then(|v| v.z().ok())
        .unwrap_or(false);
    let has_ethernet = env
        .call_method(&caps, "hasTransport", "(I)Z", &[JValue::Int(TRANSPORT_ETHERNET)])
        .ok()
        .and_then(|v| v.z().ok())
        .unwrap_or(false);
    let has_cellular = env
        .call_method(&caps, "hasTransport", "(I)Z", &[JValue::Int(TRANSPORT_CELLULAR)])
        .ok()
        .and_then(|v| v.z().ok())
        .unwrap_or(false);

    if has_wifi {
        Some("wifi")
    } else if has_ethernet {
        Some("ethernet")
    } else if has_cellular {
        Some("cellular")
    } else {
        None
    }
}

/// 桌面端：WiFi / 有线均视为非计量网络，可直接自动下载。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn detect_network_type() -> &'static str {
    "ethernet"
}

/// iOS 等其余移动端：暂不做蜂窝识别，交由前端保守处理。
#[cfg(all(not(target_os = "android"), target_os = "ios"))]
fn detect_network_type() -> &'static str {
    "unknown"
}
