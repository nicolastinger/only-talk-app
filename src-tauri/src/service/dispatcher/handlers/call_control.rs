//! 视频通话控制消息 handler(12-15)。

use log::info;

use crate::dao::friend_db::is_blocked_db;
use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::user_service::get_user_info;
use crate::utils::app_emit;

/// 处理视频通话控制消息（CallControlLifecycle，12-15）
///
/// 只向前端分发 `call_control` 事件驱动通话 UI（邀请弹窗/接受/拒绝/结束）；
/// 不落库、不进会话列表、不重发（服务端只转发不存储，历史由自动生成的文本记录承担）。
pub(crate) async fn process_call_control(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    // 自己另一台设备同步回推的消息(self-echo)：不发来电/响铃，避免本端自连回环
    if msg.send_user == me {
        info!(
            "self-echo 跳过通话控制命令: send_user={} recv_user={}",
            msg.send_user, msg.recv_user
        );
        return Ok(());
    }

    // 发送者已被拉黑：不分发控制命令（不弹通话窗口）
    if msg.send_user != me && is_blocked_db(&me, &msg.send_user).await? {
        info!("发送者已被拉黑，跳过通话控制命令: {}", msg.send_user);
        return Ok(());
    }

    let payload = serde_json::to_string(&msg)?;
    info!(
        "emit call_control: send_user={} recv_user={} text_type={} nano_id={}",
        msg.send_user, msg.recv_user, msg.text_type, msg.nano_id
    );
    app_emit::emit("call_control", payload)?;
    Ok(())
}
