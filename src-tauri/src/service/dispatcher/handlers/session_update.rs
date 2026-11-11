//! 会话列表更新(入站消息落库后广播会话事件)。

use crate::dao::session_db::update_chat_session_db;
use crate::models::entity::chat_session::ChatSession;
use crate::service::chat_service::emit_chat_session_event;
use crate::service::user_service::get_user_info;

// 更新会话列表
pub(crate) async fn update_session_list(chat_session: ChatSession) -> Result<(), anyhow::Error> {
    // 收到新消息时强制将会话置为显示状态，满足“隐藏会话直到新消息再显示”
    let mut chat_session = chat_session;
    chat_session.is_show = 1;
    update_chat_session_db(&chat_session).await?;

    // 向前的会话事件统一为规范方向（send_user=对方、recv_user=我），
    // 避免 ack/self-echo 等路径把方向写反、前端误判未读
    let me = get_user_info("uuid").await?;
    emit_chat_session_event(chat_session.to_canonical(&me), 1).await?;
    Ok(())
}
