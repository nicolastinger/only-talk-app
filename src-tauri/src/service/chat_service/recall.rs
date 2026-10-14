use anyhow::anyhow;

use crate::dao::chat_record_ack::query_ack_record_from_db;
use crate::dao::chat_record_db::{
    query_chat_record_by_id_from_db, query_single_recall_messages, recall_chat_record_db,
};
use crate::dao::group_chat_record_db::{
    query_group_chat_record_by_id, query_group_recall_messages, recall_group_chat_record_db,
};
use crate::dao::group_message_ack::query_group_message_ack_by_local_nano_id;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::recall::{build_recall_raw, parse_group_recall_target, parse_recall_target};
use crate::service::user_service::get_user_info;
use crate::utils::message_types::{MSG_TYPE_GROUP_TEXT, MSG_TYPE_RECALL};
use crate::utils::time::get_now_time_stamp_as_millis;

use super::group::send_group_text_msg_service;
use super::send::send_text_msg_service;

/// 本地撤回核对（单聊，幂等）。
///
/// 扫描会话内所有撤回控制消息并清除对应原消息，不依赖消息到达顺序，
/// 用于离线同步/历史加载时兜底（如"撤回先于原消息到达"、跨端撤回）。
/// 返回本次新命中并删除成功的条数。
pub async fn reconcile_single_recalls(me: &str, peer: &str) -> Result<usize, anyhow::Error> {
    let recalls = query_single_recall_messages(me, peer).await?;
    let mut applied = 0usize;
    for (raw, send_user) in recalls {
        if let Some(target) = parse_recall_target(&raw) {
            if recall_chat_record_db(&target, &send_user).await? {
                applied += 1;
            }
        }
    }
    Ok(applied)
}

/// 本地撤回核对（群聊，幂等）。同 `reconcile_single_recalls`，用于群聊。
pub async fn reconcile_group_recalls(group_id: &str) -> Result<usize, anyhow::Error> {
    let recalls = query_group_recall_messages(group_id).await?;
    let mut applied = 0usize;
    for (raw, send_user) in recalls {
        if let Some(target) = parse_group_recall_target(&raw) {
            if recall_group_chat_record_db(&target, group_id, &send_user).await? {
                applied += 1;
            }
        }
    }
    Ok(applied)
}

/// 解析单聊撤回目标为规范 nano_id。
///
/// 前端乐观消息持有本地 `nano_id`，ACK 后 `chat_record` 落库为服务端 `nano_id`；
/// 映射存于 ack 表：`chat_record_ack.send_id(本地) -> msg_id(服务端)`，`ack_status=1`
/// 表示已确认。历史/同步消息本就是服务端 id，查不到 ack 记录时原样返回。
pub async fn resolve_single_recall_target(local_nano_id: &str) -> String {
    if let Ok(ack) = query_ack_record_from_db(local_nano_id).await {
        if ack.ack_status == 1 && !ack.msg_id.is_empty() {
            return ack.msg_id;
        }
    }
    local_nano_id.to_string()
}

/// 解析群聊撤回目标为规范 nano_id（映射来源：`group_message_ack.local_nano_id -> nano_id`）。
pub async fn resolve_group_recall_target(local_nano_id: &str) -> String {
    if let Ok(Some(ack)) = query_group_message_ack_by_local_nano_id(local_nano_id).await {
        if ack.ack_status == 1 && !ack.nano_id.is_empty() {
            return ack.nano_id;
        }
    }
    local_nano_id.to_string()
}

/// 撤回单聊消息（伪撤回）。
///
/// 校验原消息为本人发送后，先发送一条携带目标 `nano_id` 的撤回控制消息
/// （离线时入队），成功后再清除原消息内容并置 `deleted = 1`。返回构造出的
/// 撤回消息(含本地 `nano_id`)，供前端乐观上屏；ACK 回执按 `nano_id` 归一。
pub async fn recall_chat_message_service(
    recv_user: String,
    target_nano_id: String,
) -> Result<TextQuicMsgVo, anyhow::Error> {
    let me = get_user_info("uuid").await?;

    // 前端可能传本地 nano_id，先归一为服务端 nano_id（对端也以此 id 存储）
    let target_nano_id = resolve_single_recall_target(&target_nano_id).await;

    let original = query_chat_record_by_id_from_db(&target_nano_id, &me)
        .await
        .map_err(|_| anyhow!("撤回失败：原消息不存在或已撤回"))?;
    if original.send_user != me {
        return Err(anyhow!("撤回失败：只能撤回自己发送的消息"));
    }

    let recall_msg = TextQuicMsgVo {
        nano_id: nanoid::nanoid!(),
        text_type: MSG_TYPE_RECALL,
        raw: build_recall_raw(&target_nano_id)?,
        recv_user,
        send_user: me,
        timestamp: get_now_time_stamp_as_millis()?,
    };
    // 先发送撤回控制消息(离线时入队)，成功后再清除原消息，避免发送失败导致原消息丢失
    send_text_msg_service(recall_msg.clone()).await?;
    recall_chat_record_db(&target_nano_id, &recall_msg.send_user).await?;
    Ok(recall_msg)
}

/// 撤回群聊消息（伪撤回）。
///
/// 群聊撤回以 `MSG_TYPE_GROUP_TEXT(2001)` 承载(服务端仅识别 2001/2004 为群类型)，
/// 撤回载荷作为内层文本；先发送撤回控制消息(离线时入队)，成功后再清除原消息内容
/// 并置 `deleted = 1`。
pub async fn recall_group_chat_message_service(
    group_id: String,
    target_nano_id: String,
) -> Result<TextQuicMsgVo, anyhow::Error> {
    let me = get_user_info("uuid").await?;

    // 前端可能传本地 nano_id，先归一为服务端 nano_id（对端也以此 id 存储）
    let target_nano_id = resolve_group_recall_target(&target_nano_id).await;

    let original = query_group_chat_record_by_id(&target_nano_id, &group_id)
        .await?
        .ok_or_else(|| anyhow!("撤回失败：原消息不存在或已撤回"))?;
    if original.send_user != me {
        return Err(anyhow!("撤回失败：只能撤回自己发送的消息"));
    }

    let recall_msg = TextQuicMsgVo {
        nano_id: nanoid::nanoid!(),
        text_type: MSG_TYPE_GROUP_TEXT,
        raw: build_recall_raw(&target_nano_id)?,
        recv_user: group_id,
        send_user: me,
        timestamp: get_now_time_stamp_as_millis()?,
    };
    // 先发送撤回控制消息(离线时入队)，成功后再清除原消息，避免发送失败导致原消息丢失
    send_group_text_msg_service(recall_msg.clone()).await?;
    recall_group_chat_record_db(&target_nano_id, &recall_msg.recv_user, &recall_msg.send_user)
        .await?;
    Ok(recall_msg)
}
