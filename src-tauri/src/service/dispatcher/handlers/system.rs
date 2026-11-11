//! 系统/通知消息 handler。

use anyhow::anyhow;
use log::info;

use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::entity::system_notification::SystemNotification;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::{friend_service, group_service};
use crate::utils::events;

// 处理系统信息
pub(crate) async fn process_system_message(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let payload = serde_json::to_string(&msg)?;
    info!("接收到系统信息 {:?}", msg);

    {
        events::emit("system_message", payload)?;
    }
    Ok(())
}

// 处理通知消息
pub(crate) async fn process_notify_message(
    text_quic_msg: TextQuicMsg,
) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let system_notification = serde_json::from_str::<SystemNotification>(&msg.raw)?;
    // 插入数据库
    SystemNotification::insert(&system_notification).await?;
    let payload = serde_json::to_string(&system_notification)?;
    // 发送完整通知数据给前端
    events::emit("listen_notify_msg", &payload)?;
    // 处理对应通知类型
    match system_notification.level1.ok_or(anyhow!("level1为空"))? {
        1 => {
            // 处理本系统通知
            info!("处理本系统通知 {:?}", system_notification);
            process_local_notify_message(system_notification).await?;
        }
        2 => {
            // 处理第三方通知
            info!("处理第三方通知 {:?}", system_notification);
        }
        _ => {
            // 处理其他通知
            info!("处理其他通知 {:?}", system_notification);
        }
    }
    Ok(())
}

async fn process_local_notify_message(
    system_notification: SystemNotification,
) -> Result<(), anyhow::Error> {
    match system_notification.level2.ok_or(anyhow!("level2为空"))? {
        1 => {
            friend_service::process_friend_notify_message(system_notification).await?;
        }
        2 => {
            info!("处理用户本身通知 {:?}", system_notification);
        }
        3 => {
            group_service::process_group_notify_message(system_notification).await?;
        }
        4 => {
            info!("处理交友广场通知 {:?}", system_notification);
        }
        5 => {
            info!("处理动态广场通知 {:?}", system_notification);
        }
        _ => {
            info!("处理其他通知 {:?}", system_notification);
        }
    }
    Ok(())
}
