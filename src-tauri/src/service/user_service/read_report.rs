//! 已读水位与系统通知的定时上报。

use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use uuid::Uuid;

use super::session::check_schedule_key;
use crate::dao::chat_record_db::{chat_record_timestamp_by_nano_id, query_read_peers};
use crate::dao::chat_record_read::{
    read_reported_position, read_watermark_nano_id, update_reported_position,
};
use crate::dao::group_chat_record_db::group_chat_record_timestamp_by_nano_id;
use crate::dao::group_message_read::{
    group_read_reported_position, group_read_watermark_nano_id, query_group_read_peers,
    update_group_reported_position,
};
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::chat_record_read::{CHAT_TYPE_GROUP, CHAT_TYPE_SINGLE};
use crate::models::entity::system_notification::SystemNotification;
use crate::service::api_service::{parse_http_result, post_request};
use crate::utils::global_static_str::talk_api_base;
use crate::utils::session_uuid::single_session_uuid;
use crate::utils::user_state::get_user_info;
use crate::GLOBAL_QUIC_USER_INFO;

// 发送已读消息(任务07): 按会话聚合, 只上报本地已读水位的 nano_id。
//
// 上报值 = 已读水位(nano_id), 而不是本地 max(server_id) 或换算出的数值游标:
// - 本地 chat_record.server_id 靠同步回填、在线消息为 NULL, 用它拼数值游标天然不可靠;
// - 已读以服务端同步下来的 last_read_id 为第一准则(backfill_read_watermark 已对齐本地水位);
// - 服务端收到 nano_id 后按会话类型反查自己的消息 id 再推进(只前进)。
//
// 推进校验(缓存表 reported_nano_id + reported_timestamp): 上报前按 nano_id 回查**本地聊天记录表**
// (`chat_record` / `group_chat_record`) 的时间戳, **必须严格大于**上次已上报的时间戳才允许上报。
// 水位表记录的时间戳是"阅读事件"水位, 可能被跨端回填推到历史位置; 聊天记录表的时间戳才是
// 消息本身的先后顺序 —— 只推它更晚的消息, 避免把更旧位置重复推给服务端。
//
// 上报节流: 每次上报间隔随机 60~90 秒(打散各端上报时刻, 防"已读风暴"集中打服务端)。
fn next_read_report_delay() -> Duration {
    // 取 uuid v4 的 128 位随机数取模, 均匀落在 [0, 31) → 60 + r ∈ [60, 90]
    let r = (Uuid::new_v4().as_u128() % 31) as u64;
    Duration::from_secs(60 + r)
}

pub async fn send_read_message(key: String) -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;

    let mut count = 0;
    while count < 1000000 {
        // 校验定时任务key
        check_schedule_key(&key).await?;

        // 同步中则跳过
        {
            let user_info = GLOBAL_QUIC_USER_INFO.read().await;
            if user_info.get("is_syncing").map(|v| v == "true").unwrap_or(false) {
                tokio::time::sleep(Duration::from_secs(10)).await;
                count += 1;
                continue;
            }
        }

        // 本次待上报项: (session_uuid, session_type, 上报后待推进的 (peer|group, nano_id, ts))
        let mut reads: Vec<serde_json::Value> = Vec::new();
        let mut pending_single: Vec<(String, String, i64)> = Vec::new();
        let mut pending_group: Vec<(String, String, i64)> = Vec::new();

        // 单聊: 按对端聚合 → 派生 session_uuid → 已读水位 nano_id
        for (peer, _ts) in query_read_peers(&uuid, 0).await? {
            // 自己给自己的消息没有对端, 不需要上报已读(历史遗留的水位行直接跳过)
            if peer == uuid {
                continue;
            }
            let su = match (Uuid::parse_str(&uuid), Uuid::parse_str(&peer)) {
                (Ok(a), Ok(b)) => single_session_uuid(&a, &b).to_string(),
                _ => continue,
            };
            // 无水位(未读过) → 跳过
            let Some(nano_id) = read_watermark_nano_id(&uuid, &peer).await? else { continue };
            if nano_id.is_empty() {
                continue;
            }
            // 按 nano_id 回查本地聊天记录表时间戳: 推进校验以它为准(非水位表时间戳)
            let Some(ts) = chat_record_timestamp_by_nano_id(&nano_id).await? else { continue };
            // 推进校验: 聊天记录时间戳必须严格大于上次已上报时间戳
            let (_, last_ts) = read_reported_position(&uuid, &peer).await?;
            if ts <= last_ts {
                continue;
            }
            reads.push(serde_json::json!({
                "session_uuid": su,
                "session_type": CHAT_TYPE_SINGLE,
                "last_read_nano_id": nano_id,
            }));
            pending_single.push((peer, nano_id, ts));
        }

        // 群聊: group_uuid 即 session_uuid
        for (group, _ts) in query_group_read_peers(&uuid, 0).await? {
            let Some(nano_id) = group_read_watermark_nano_id(&group, &uuid).await? else {
                continue;
            };
            if nano_id.is_empty() {
                continue;
            }
            let Some(ts) = group_chat_record_timestamp_by_nano_id(&nano_id).await? else {
                continue;
            };
            let (_, last_ts) = group_read_reported_position(&group, &uuid).await?;
            if ts <= last_ts {
                continue;
            }
            reads.push(serde_json::json!({
                "session_uuid": group,
                "session_type": CHAT_TYPE_GROUP,
                "last_read_nano_id": nano_id,
            }));
            pending_group.push((group, nano_id, ts));
        }

        if !reads.is_empty() {
            info!("发送已读消息(水位 nano_id) {:?}", reads);
            match post_request(
                format!("{}/session/read", talk_api_base()),
                serde_json::to_string(&serde_json::json!({ "reads": reads }))
                    .expect("序列化已读消息失败"),
            )
            .await
            {
                Ok(m) => {
                    // 成功后推进本地上报位置(记 nano_id + 聊天记录时间戳); 失败则下轮重试
                    let ok = parse_http_result(&m.body)
                        .map(|r| r.code == 200 || r.code == 204)
                        .unwrap_or(false);
                    if ok {
                        info!("发送已读消息成功 {:?}", m.body);
                        for (peer, nano_id, ts) in pending_single {
                            update_reported_position(&uuid, &peer, &nano_id, ts).await?;
                        }
                        for (group, nano_id, ts) in pending_group {
                            update_group_reported_position(&group, &uuid, &nano_id, ts).await?;
                        }
                    } else {
                        error!("发送已读消息失败(响应异常): {}", m.body);
                    }
                }
                Err(e) => error!("发送已读消息失败 {:?}", e),
            }
        }
        count += 1;
        tokio::time::sleep(next_read_report_delay()).await;
    }
    Ok(())
}

/// 定时上报系统通知已读状态到服务端
pub async fn send_notify_read_message(key: String) -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;
    let mut count = 0;
    while count < 1000000 {
        // 校验定时任务key
        check_schedule_key(&key).await?;

        // 同步中则跳过
        {
            let user_info = GLOBAL_QUIC_USER_INFO.read().await;
            if user_info.get("is_syncing").map(|v| v == "true").unwrap_or(false) {
                tokio::time::sleep(Duration::from_secs(10)).await;
                count += 1;
                continue;
            }
        }

        // 查询本地已读但未同步的通知 id
        let read_ids = SystemNotification::query_read_not_synced_ids(&uuid).await?;
        if !read_ids.is_empty() {
            info!("上报通知已读: {:?}", read_ids);
            // 服务端 MarkReadDTO 期望 `{"ids": [...]}` 对象; 裸数组会 400(契约不匹配)
            let body = serde_json::to_string(&serde_json::json!({ "ids": read_ids }))
                .expect("序列化通知已读失败");
            match post_request(format!("{}/notify/mark_read", talk_api_base()), body).await {
                Ok(m) => {
                    let result = match parse_http_result(&m.body) {
                        Ok(r) => r,
                        Err(parse_err) => {
                            // 响应体不是预期 JSON(如 404/500 的文本页): 带上状态码与原文便于定位
                            error!(
                                "通知已读上报失败: 响应解析失败 status={} body={} err={}",
                                m.status, m.body, parse_err
                            );
                            HttpResult {
                                code: -1,
                                message: String::new(),
                                data: serde_json::Value::Null,
                            }
                        }
                    };
                    if result.code == 200 || result.code == 204 {
                        SystemNotification::mark_read_synced(&uuid, &read_ids).await?;
                        info!("通知已读上报成功: {:?}", read_ids);
                    } else {
                        error!(
                            "通知已读上报失败: status={} code={} message={}",
                            m.status, result.code, result.message
                        );
                    }
                }
                Err(e) => {
                    error!("通知已读上报失败 {:?}", e);
                }
            }
        }
        count += 1;
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
    Ok(())
}

/// 获取未读通知
pub async fn get_unread_notification() -> Result<(), anyhow::Error> {
    let url = format!("{}/notify/get_user_unread_notification", talk_api_base());
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let data = result.body;
    let result = parse_http_result(&data)?;
    if result.code != 200 {
        error!("获取未读通知失败 {}", result.message);
        return Ok(());
    }
    let system_notification_vec: Vec<SystemNotification> = serde_json::from_value(result.data)?;
    info!("获取未读通知结果 {:?}", system_notification_vec);

    if system_notification_vec.is_empty() {
        return Ok(());
    }

    for system_notification in system_notification_vec {
        match SystemNotification::insert(&system_notification).await {
            Ok(_) => {}
            Err(e) => {
                warn!("插入系统通知失败 {}", e);
                continue;
            }
        }
    }
    Ok(())
}
