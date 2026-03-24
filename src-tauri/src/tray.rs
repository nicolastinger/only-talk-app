use log::{error, info};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, Runtime,
};

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, Box<dyn std::error::Error>> {
    let show_window = MenuItem::with_id(app, "show_window", "显示主界面", true, None::<&str>)?;
    let quit_app = MenuItem::with_id(app, "quit_app", "退出应用", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_window, &quit_app])?;

    let icon_bytes = include_bytes!("../icons/icon.ico");
    let icon = Image::from_bytes(icon_bytes)?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_window" => {
                if let Some(window) = app.get_webview_window("home") {
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
