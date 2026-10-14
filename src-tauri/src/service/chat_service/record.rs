use log::error;

use super::recall::{reconcile_group_recalls, reconcile_single_recalls};
use crate::dao::chat_record_db::{query_chat_record_by_type_from_db, query_chat_record_from_db};
use crate::dao::group_chat_record_db::query_group_chat_record_from_db;
use crate::models::entity::Page;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;

/// 分页获取聊天记录
pub async fn get_chat_record_service(
    text_quic_msg: TextQuicMsgVo,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    // 首页加载时先做一次本地撤回核对（幂等）：修正离线同步/跨端撤回因时序或补拉导致的遗漏
    if page.current <= 1 {
        if let Err(e) =
            reconcile_single_recalls(&text_quic_msg.send_user, &text_quic_msg.recv_user).await
        {
            error!("单聊撤回核对失败: {}", e);
        }
    }
    let limit = page.size;
    let offset = (page.current - 1) * page.size;
    query_chat_record_from_db(&text_quic_msg.send_user, &text_quic_msg.recv_user, limit, offset)
        .await
}

/// 按消息类型分页获取聊天记录
pub async fn get_chat_record_by_type_service(
    text_quic_msg: TextQuicMsgVo,
    text_type: u16,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    let limit = page.size;
    let offset = (page.current - 1) * page.size;
    query_chat_record_by_type_from_db(
        &text_quic_msg.send_user,
        &text_quic_msg.recv_user,
        text_type,
        limit,
        offset,
    )
    .await
}

/// 分页获取群聊记录
pub async fn get_group_chat_record_service(
    group_id: String,
    page: Page,
) -> Result<Vec<TextQuicMsgVo>, anyhow::Error> {
    // 首页加载时先做一次本地撤回核对（幂等）：修正离线同步/跨端撤回因时序或补拉导致的遗漏
    if page.current <= 1 {
        if let Err(e) = reconcile_group_recalls(&group_id).await {
            error!("群聊撤回核对失败: {}", e);
        }
    }
    let limit = page.size;
    let offset = (page.current - 1) * page.size;
    query_group_chat_record_from_db(&group_id, limit, offset).await
}
