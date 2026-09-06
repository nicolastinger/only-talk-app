//! 新消息到达提醒
//!
//! 规则(与产品约定一致)：
//! - 消息属于“当前正在查看的会话”→ 不提醒(已在看，只走未读/清未读逻辑)；
//! - 消息来自其它会话：
//!   - App 不在前台(后台/最小化/托盘隐藏/失焦)→ 发**系统通知**(OS toast)；
//!   - App 在前台 → 向前端发 **alert_incoming_message** 横幅事件，
//!     由桌面端弹可点击横幅跳到对应会话(移动端收到后可自行忽略或也弹内部提示)。
//! - 自己其它端发来的消息不提醒；同一会话短时间(见 `ALERT_DEBOUNCE_MS`)内只提醒一次，避免刷屏。
//!
//! 系统通知会携带 `extra.chat = { is_group, target }`，移动端在用户点击通知时
//! 通过插件的 action(`actionId == "tap"`)回传，前端据此路由到对应会话窗口。

use std::collections::HashMap;
use std::sync::LazyLock;

use log::{error, info};
use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;

use crate::dao::friend_db::query_friend_info_by_id_db;
use crate::entity::group::Group;
use crate::utils::global_static_str::SYSTEM;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{APP_HANDLE, GLOBAL_QUIC_USER_INFO};

/// 同一会话两次提醒的最小间隔(毫秒)
const ALERT_DEBOUNCE_MS: i64 = 4000;

/// 按会话记录上一次提醒时间(毫秒时间戳)，用于去抖
static LAST_ALERT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 单聊文本 / 图片 / 文件 类型
const SINGLE_TEXT: u16 = 1;
const SINGLE_IMAGE: u16 = 2;
const SINGLE_FILE: u16 = 3;
/// 群聊文本 / 图片 / 文件 类型
const GROUP_TEXT: u16 = 2001;
const GROUP_IMAGE: u16 = 2002;
const GROUP_FILE: u16 = 2003;

/// 系统通知 extra 里携带的会话跳转信息
#[derive(Serialize, Clone)]
struct ChatExtra {
    is_group: bool,
    target: String,
}

/// 发给前端的横幅事件 payload
#[derive(Serialize, Clone)]
struct BannerPayload {
    is_group: bool,
    target: String,
    title: String,
    body: String,
}

/// 收到一条新消息(单聊或群聊)后调用，决定是否提醒/如何提醒。
///
/// - `me`：当前登录用户 uuid
/// - `msg`：收到的消息
/// - `is_group`：是否群聊消息
/// - `viewing`：该消息所属会话是否为“当前正在查看的会话”
pub async fn on_incoming_message(
    me: &str,
    msg: &TextQuicMsgVo,
    is_group: bool,
    viewing: bool,
) {
    // 自己其它端发来的消息不提醒
    if msg.send_user == me || msg.send_user == SYSTEM {
        return;
    }
    // 只对文本/图片/文件这三类“聊天内容”提醒(排除视频通话控制、系统等)
    if !is_notifiable_type(msg.text_type, is_group) {
        return;
    }

    // 正在查看该会话 → 不提醒
    if viewing {
        return;
    }

    // 会话目标：单聊 = 好友 uuid(send_user)；群聊 = 群 uuid(recv_user)
    let target = if is_group { msg.recv_user.clone() } else { msg.send_user.clone() };
    if target.is_empty() {
        return;
    }

    // 去抖：短时间同会话只提醒一次
    let now = get_now_time_stamp_as_millis().unwrap_or(0);
    {
        let mut last = LAST_ALERT.lock().await;
        if let Some(&prev) = last.get(&target) {
            if now - prev < ALERT_DEBOUNCE_MS {
                return;
            }
        }
        last.insert(target.clone(), now);
    }

    let (title, body) = build_title_body(me, msg, is_group).await;

    // 前台状态：默认视为前台，避免登录/启动初期误发系统通知
    let foreground = {
        let map = GLOBAL_QUIC_USER_INFO.read().await;
        map.get("app_foreground").map(|v| v.as_str()) != Some("0")
    };

    if foreground {
        // 前台且非当前会话 → 提示前端(桌面弹可点击横幅)
        let payload = serde_json::to_string(&BannerPayload {
            is_group,
            target: target.clone(),
            title: title.clone(),
            body: body.clone(),
        })
        .unwrap_or_default();
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("alert_incoming_message", payload);
        }
        return;
    }

    // 后台/失焦 → 发系统通知，并携带会话跳转信息(extra.chat)
    info!("发送新消息系统通知: is_group={} target={} title={:?}", is_group, target, title);
    if let Some(app) = APP_HANDLE.get() {
        let extra = serde_json::json!({ "chat": ChatExtra { is_group, target } });
        if let Err(e) = app
            .notification()
            .builder()
            .title(title.as_str())
            .body(body.as_str())
            .extra("payload", extra)
            .auto_cancel()
            .show()
        {
            error!("发送系统通知失败: {}", e);
        }

        // Windows 托盘提示：窗口隐藏/最小化时短暂闪烁托盘图标
        #[cfg(desktop)]
        crate::tray::pulse_tray_on_new_message(app);
    }
}

/// 判断消息类型是否需要提醒
fn is_notifiable_type(text_type: u16, is_group: bool) -> bool {
    if is_group {
        matches!(text_type, GROUP_TEXT | GROUP_IMAGE | GROUP_FILE)
    } else {
        matches!(text_type, SINGLE_TEXT | SINGLE_IMAGE | SINGLE_FILE)
    }
}

/// 构建通知标题与正文
async fn build_title_body(me: &str, msg: &TextQuicMsgVo, is_group: bool) -> (String, String) {
    let preview = preview_body(msg);
    if is_group {
        let title = match Group::query_by_group_id(&msg.recv_user).await {
            Ok(Some(g)) if !g.group_name.is_empty() => g.group_name,
            _ => "群消息".to_string(),
        };
        (title, preview)
    } else {
        let title = match query_friend_info_by_id_db(me, &msg.send_user).await {
            Ok(f) if !f.friend_name.is_empty() => f.friend_name,
            _ => "新消息".to_string(),
        };
        (title, preview)
    }
}

/// 从消息 raw 中提取用于预览的文本(图片/文件显示占位文案)
fn preview_body(msg: &TextQuicMsgVo) -> String {
    match msg.text_type {
        SINGLE_IMAGE | GROUP_IMAGE => "[图片]".to_string(),
        SINGLE_FILE | GROUP_FILE => "[文件]".to_string(),
        _ => {
            // 文本类(单聊/群聊)，raw 可能多层嵌套 JSON，向下挖掘 “text” 字段
            match serde_json::from_str::<serde_json::Value>(&msg.raw) {
                Ok(value) => extract_text(&value, 0)
                    .map(trim_preview)
                    .unwrap_or_else(|| "新消息".to_string()),
                Err(_) => trim_preview(msg.raw.clone()),
            }
        }
    }
}

/// 递归在 JSON 中查找第一个可读文本(“text” 字段 / 直接字符串)
fn extract_text(value: &serde_json::Value, depth: usize) -> Option<String> {
    if depth > 3 {
        return None;
    }
    match value {
        serde_json::Value::String(s) if !s.is_empty() => Some(s.clone()),
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(s)) = map.get("text") {
                if !s.is_empty() {
                    // 群聊文本 raw 的 text 可能是“字符串化的内层 JSON”，继续下钻取真正的文本
                    if let Ok(inner) = serde_json::from_str::<serde_json::Value>(s) {
                        if inner.is_object() || inner.is_string() {
                            if let Some(text) = extract_text(&inner, depth + 1) {
                                return Some(text);
                            }
                        }
                    }
                    return Some(s.clone());
                }
            }
            for v in map.values() {
                if let Some(text) = extract_text(v, depth + 1) {
                    return Some(text);
                }
            }
            None
        }
        _ => None,
    }
}

/// 截断过长的预览
fn trim_preview(raw: String) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() > 60 {
        trimmed.chars().take(60).collect::<String>() + "…"
    } else {
        trimmed.to_string()
    }
}
