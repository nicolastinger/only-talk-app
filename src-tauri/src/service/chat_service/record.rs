use log::error;

use super::recall::{reconcile_group_recalls, reconcile_single_recalls};
use super::session::update_last_read_msg_from_db;
use crate::dao::chat_record_db::{
    delete_chat_record_db, query_chat_record_by_id_from_db, query_chat_record_by_type_from_db,
    query_chat_record_from_db,
};
use crate::dao::chat_record_send::query_chat_record_send_by_user;
use crate::dao::group_chat_record_db::{
    delete_group_chat_record_db, query_group_chat_record_from_db,
};
use crate::models::entity::chat_record_send::ChatRecordSend;
use crate::models::entity::Page;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::utils::user_state::get_user_info;

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

/// 单聊已读: 按 nano_id 取本地记录并推进已读水位。
pub async fn mark_read_service(nano_id_list: Vec<String>) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let mut last_msg_vec: Vec<TextQuicMsgVo> = Vec::with_capacity(nano_id_list.len());
    for nano_id in nano_id_list {
        let text_quic_msg = query_chat_record_by_id_from_db(&nano_id, &me).await?;
        last_msg_vec.push(text_quic_msg);
    }
    update_last_read_msg_from_db(last_msg_vec).await
}

/// 获取某好友的待发送记录(0-排队中, 1-发送中, 2-发送失败)。
pub async fn get_pending_send_records_service(
    recv_user: String,
) -> Result<Vec<ChatRecordSend>, anyhow::Error> {
    let me = get_user_info("uuid").await?;
    query_chat_record_send_by_user(&me, &recv_user, vec![0, 1, 2], true).await
}

/// 本机软删除单聊聊天记录(deleted 置 1, 不通知服务端)。
pub async fn delete_chat_record_service(nano_id_list: Vec<String>) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    delete_chat_record_db(&nano_id_list, &me).await
}

/// 本机软删除群聊聊天记录(deleted 置 1, 不通知服务端)。
pub async fn delete_group_chat_record_service(
    nano_id_list: Vec<String>,
    group_id: String,
) -> Result<(), anyhow::Error> {
    delete_group_chat_record_db(&nano_id_list, &group_id).await
}
