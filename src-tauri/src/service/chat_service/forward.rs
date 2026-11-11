use std::collections::HashMap;

use anyhow::anyhow;
use log::info;
use serde::{Deserialize, Serialize};

use super::group::send_group_text_msg_service;
use super::message_convert::{extract_biz_id, normalize_for_target, replace_biz_id};
use super::send::send_text_msg_service;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::api_service::post_json;
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::talk_api_base;
use crate::utils::time::get_now_time_stamp_as_millis;

/// 转发文件"重新发牌"接口请求体
#[derive(Serialize)]
struct ForwardChatBizBody {
    /// 需要重新签发的来源 biz（图片/文件/语音消息 raw 里的 biz_id）
    biz_ids: Vec<String>,
    /// 目标接收者：单聊为好友 uuid，群聊为群 uuid
    receiver: String,
    /// 目标是否为群聊
    is_group: bool,
}

/// "重新发牌"接口返回项：来源 biz -> 新目标 biz
#[derive(Deserialize)]
struct ForwardChatBizItem {
    source_biz_id: String,
    biz_id: String,
}

#[derive(Deserialize)]
struct ForwardChatBizResponse {
    code: u16,
    #[serde(default)]
    data: Option<Vec<ForwardChatBizItem>>,
    #[serde(default)]
    message: String,
}

/// 请求服务端为本次转发目标签发新的 biz_id（复用原文件，不重新上传）。
///
/// 服务端据此为目标用户/群新建 `chat_biz_record`，使接收方获得下载权限；
/// 返回 `来源 biz -> 新 biz` 映射。
async fn reissue_forward_biz(
    biz_ids: Vec<String>,
    target_recv: &str,
    target_group: bool,
) -> Result<HashMap<String, String>, anyhow::Error> {
    if biz_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let url = format!("{}/file/forward/chat_biz", talk_api_base());
    let response = post_json(
        url,
        &ForwardChatBizBody { biz_ids, receiver: target_recv.to_string(), is_group: target_group },
    )
    .await?;

    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(anyhow!("转发文件授权失败: HTTP {} {}", status.as_u16(), body));
    }

    let parsed: ForwardChatBizResponse =
        serde_json::from_str(&body).map_err(|e| anyhow!("解析转发文件授权响应失败: {}", e))?;
    if parsed.code != 200 {
        return Err(anyhow!("转发文件授权失败: {}", parsed.message));
    }

    let items = parsed.data.unwrap_or_default();
    Ok(items.into_iter().map(|item| (item.source_biz_id, item.biz_id)).collect())
}

/// 逐条转发消息到目标会话（好友或群）。
///
/// 图片/文件/语音不会重新上传：先向服务端为**本次转发目标**申请新的 `biz_id`
/// （服务端复用原文件关联，新建一条 chat_biz_record），再把新 biz 写回 raw，
/// 接收方即可凭新 biz 下载；文本等无文件消息直接按目标格式发送。
/// 私聊目标由调用方持有 `GLOBAL_MSG_SEND_LOCK`；群聊目标无锁依赖。
pub async fn forward_chat_messages_service(
    messages: Vec<TextQuicMsgVo>,
    target_recv: &str,
    target_group: bool,
) -> Result<(), anyhow::Error> {
    let sender = get_user_info("uuid").await?;
    let count = messages.len();

    // 1. 先归一化为目标会话格式，并收集需要重新授权的文件 biz
    let mut prepared: Vec<(u16, String, Option<String>)> = Vec::with_capacity(count);
    for origin in messages {
        let (text_type, raw) =
            normalize_for_target(origin.text_type, &origin.raw, target_group, &sender)?;
        let biz_id = extract_biz_id(text_type, &raw);
        prepared.push((text_type, raw, biz_id));
    }

    // 2. 一次请求为所有文件消息签发新 biz（转发给"自己"时无需授权，原 biz 已可见）
    let mut biz_map: HashMap<String, String> = HashMap::new();
    if target_recv != sender {
        let mut biz_ids: Vec<String> =
            prepared.iter().filter_map(|(_, _, biz)| biz.clone()).collect();
        biz_ids.sort();
        biz_ids.dedup();
        biz_map = reissue_forward_biz(biz_ids, target_recv, target_group).await?;
    }

    // 3. 用新 biz 改写 raw，再逐条发送
    for (text_type, raw, biz_id) in prepared {
        let raw = match biz_id {
            Some(old_biz) => {
                let new_biz = biz_map
                    .get(&old_biz)
                    .ok_or_else(|| anyhow!("转发文件授权缺失: {}", old_biz))?;
                replace_biz_id(text_type, &raw, new_biz)?
            }
            None => raw,
        };
        let timestamp = get_now_time_stamp_as_millis()?;
        let msg = TextQuicMsgVo {
            nano_id: nanoid::nanoid!(),
            text_type,
            raw,
            recv_user: target_recv.to_string(),
            send_user: String::new(),
            timestamp,
        };
        if target_group {
            send_group_text_msg_service(msg).await?;
        } else {
            send_text_msg_service(msg).await?;
        }
    }

    info!("消息转发完成: {} 条", count);
    Ok(())
}
