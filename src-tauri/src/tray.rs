use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use log::{error, info};
use tauri::image::Image;
use tauri::menu::{Menu, MenuEvent, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Runtime};

/// 收到新消息时是否正在闪烁托盘图标(避免并发重复触发)
static PULSING: AtomicBool = AtomicBool::new(false);

/// 闪烁轮数(每轮 500ms,一轮亮提醒图标一轮恢复,约 6s)
const PULSE_ROUNDS: u32 = 12;

pub fn setup_tray<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<TrayIcon<R>, Box<dyn std::error::Error>> {
    let show_window = MenuItem::with_id(app, "show_window", "显示主界面", true, None::<&str>)?;
    let quit_app = MenuItem::with_id(app, "quit_app", "退出应用", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_window, &quit_app])?;

    let icon_bytes = include_bytes!("../icons/icon.ico");
    let icon = Image::from_bytes(icon_bytes)?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app: &AppHandle<R>, event: MenuEvent| match event.id.as_ref() {
            "show_window" => {
                // 真实窗口 label 为 main(历史遗留曾用 home),两者都兜底尝试
                let window = app
                    .get_webview_window("main")
                    .or_else(|| app.get_webview_window("home"));
                if let Some(window) = window {
                    if let Err(e) = window.show() {
                        error!("显示窗口失败: {}", e);
                    }
                    if let Err(e) = window.set_focus() {
                        error!("聚焦窗口失败: {}", e);
                    }
                    info!("显示主界面");
                }
            }
            "quit_app" => {
                info!("退出应用");
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    info!("系统托盘初始化成功");
    Ok(tray)
}

/// 收到新消息且主窗口不可见时的托盘提示(仅 Windows):短暂闪烁托盘图标
/// (普通图标 ⇄ 带红点的提醒图标),几秒后自动恢复原图标。
pub fn pulse_tray_on_new_message<R: Runtime>(app: &AppHandle<R>) {
    if !cfg!(target_os = "windows") {
        return;
    }
    if PULSING.swap(true, Ordering::SeqCst) {
        return; // 正在闪烁,避免并发
    }
    // 窗口仍然可见且未最小化(用户只是切到别的应用)时不闪托盘,交给系统通知提示即可
    let should_pulse = {
        let win = app
            .get_webview_window("main")
            .or_else(|| app.get_webview_window("home"));
        match win {
            Some(window) => {
                let visible = window.is_visible().unwrap_or(false);
                let minimized = window.is_minimized().unwrap_or(false);
                !(visible && !minimized)
            }
            None => true, // 找不到窗口说明未初始化或已隐藏,一律允许闪烁
        }
    };
    if !should_pulse {
        PULSING.store(false, Ordering::SeqCst);
        return;
    }
    let alert_bytes = match build_alert_icon_bytes() {
        Ok(bytes) => bytes,
        Err(e) => {
            error!("生成托盘提醒图标失败: {}", e);
            PULSING.store(false, Ordering::SeqCst);
            return;
        }
    };
    let normal_bytes: &'static [u8] = include_bytes!("../icons/128x128.png");
    let app_handle = app.clone();

    info!("收到新消息,托盘图标开始闪烁提示");
    tauri::async_runtime::spawn(async move {
        for i in 0..PULSE_ROUNDS {
            let bytes = if i % 2 == 0 { normal_bytes.to_vec() } else { alert_bytes.clone() };
            set_tray_icon(&app_handle, bytes).await;
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        // 结束前恢复原图标
        set_tray_icon(&app_handle, normal_bytes.to_vec()).await;
        PULSING.store(false, Ordering::SeqCst);
        info!("托盘图标闪烁结束");
    });
}

/// 在主线程上替换托盘图标
async fn set_tray_icon<R: Runtime>(app: &AppHandle<R>, bytes: Vec<u8>) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app_inner.tray_by_id("main") {
            if let Ok(image) = Image::from_bytes(&bytes) {
                if let Err(e) = tray.set_icon(Some(image)) {
                    error!("更新托盘图标失败: {}", e);
                }
            }
        }
    });
}

/// 生成"带红点提醒"的托盘图标 PNG(以 128x128 应用图标为底图,右下角画红点)
fn build_alert_icon_bytes() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let base = include_bytes!("../icons/128x128.png");
    let img = image::load_from_memory(base)?.to_rgba8();
    let (w, h) = img.dimensions();

    // 红点半径取短边的 18%
    let r = ((w.min(h) as f32) * 0.18) as i64;
    let cx = w as i64 - r - 2;
    let cy = h as i64 - r - 2;
    let r2 = r * r;

    let mut out = img;
    for y in 0..h {
        for x in 0..w {
            let dx = x as i64 - cx;
            let dy = y as i64 - cy;
            if dx * dx + dy * dy <= r2 {
                out.put_pixel(x, y, image::Rgba([0xe5, 0x3b, 0x3b, 255]));
            }
        }
    }

    let mut buf = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(out).write_to(&mut buf, image::ImageFormat::Png)?;
    Ok(buf.into_inner())
}
