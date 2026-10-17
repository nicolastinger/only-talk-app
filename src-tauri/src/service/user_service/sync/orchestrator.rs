//! 正向追平编排: 通知 → 刷新会话列表 → 串行逐会话追平 → 记录批次。

use anyhow::anyhow;
use log::{error, info, warn};

use super::apply::{apply_sync_session, backfill_read_watermark};
use super::session_merge::refresh_session_list;
use super::types::{SessionListItem, SyncResponse};
use crate::dao::chat_record_db::local_max_server_id;
use crate::dao::group_chat_record_db::local_max_group_server_id;
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::sync_task::{SYNC_STATUS_FAILED, SYNC_STATUS_SUCCESS};
use crate::service::api_service::post_request;
use crate::service::group_service::parse_http_result;
use crate::service::user_service::read_report::get_unread_notification;
use crate::utils::global_static_str::talk_api_base;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::utils::user_state::get_user_info;
use crate::GLOBAL_QUIC_USER_INFO;

/// 单会话单次正向拉取条数。
const SYNC_PULL_LIMIT: u32 = 100;
/// 追平记录保留批数(每轮重连 = 一批)。
const SYNC_BATCH_KEEP: i64 = 50;

/// 重连后同步离线消息(任务12 简化: 正向追平): 通知 → refresh → 串行逐会话追平。
pub async fn sync_offline_messages() {
    // 设置同步中标志，阻止已读消息发送
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("is_syncing".to_string(), "true".to_string());
    }

    get_unread_notification().await.unwrap_or_else(|e| error!("拉取未读通知失败 {:?}", e));
    refresh_and_forward().await;

    // 同步完成，移除标志
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("is_syncing".to_string(), "false".to_string());
    }
}

/// 刷新会话列表并正向追平离线消息(任务12 简化): 先 `refresh_session_list` 拿到
/// 每个会话服务端最新 id(`last_message_id`), 再 `sync_sessions_forward` 串行追平。
pub(crate) async fn refresh_and_forward() {
    match refresh_session_list().await {
        Ok(sessions) => {
            if let Err(e) = sync_sessions_forward(&sessions).await {
                error!("[session][sync] 离线消息正向追平失败 {:?}", e);
            }
        }
        Err(e) => error!("[session][sync] 刷新会话列表失败 {:?}", e),
    }
}

/// 正向追平(任务12 简化): 串行遍历会话, 把本地已同步的最新 id(`after_id`)发给服务端,
/// 拉取窗口内 `id > after_id` 的消息, 直到追平服务端最新 id(`last_message_id`)或 7 天窗口尽头。
///
/// 本地前沿 = `chat_record.server_id` / `group_chat_record.server_id` 的最大值(在线 QUIC 消息
/// 无 server_id, 会在此被重新拉取, nano_id 去重兜底并顺带回填 server_id)。
///
/// 每轮 = 一个批次(`batch_id = now`), 每个有增量并尝试追平的会话写一条**终态**记录到
/// `sync_task`(成功/失败), 供前端 `get_sync_history` 查看追平结果。单会话失败不阻断整轮。
async fn sync_sessions_forward(sessions: &[SessionListItem]) -> Result<(), anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let batch_id = get_now_time_stamp_as_millis()?;
    let mut synced_sessions = 0usize;
    let mut failed_sessions = 0usize;
    for s in sessions {
        let target = s.last_message_id;
        if target <= 0 {
            continue; // 服务端该会话无消息
        }
        // 本地前沿: 单聊按对端、群聊按 group_uuid
        let mine = match s.session_type {
            2 => local_max_group_server_id(&s.session_uuid).await?.unwrap_or(0),
            _ => {
                let Some(peer) = s.peer_uuid.as_ref().filter(|p| !p.is_empty()) else {
                    continue;
                };
                local_max_server_id(&me, peer).await?.unwrap_or(0)
            }
        };
        if target <= mine {
            continue; // 已追平
        }

        let mut after = mine;
        let mut pulled = 0usize;
        let mut total_new = 0i64;
        let mut server_last_read_id = 0i64;
        let pull_result: Result<(), anyhow::Error> = async {
            loop {
                let body = serde_json::json!({
                    "sessions": [{ "session_uuid": s.session_uuid, "after_id": after }],
                    "limit": SYNC_PULL_LIMIT,
                });
                let resp =
                    post_request(format!("{}/session/sync", talk_api_base()), body.to_string())
                        .await
                        .map_err(|e| anyhow!(e))?;
                let result: HttpResult = parse_http_result(&resp.body)?;
                if result.code != 200 || result.data.is_null() {
                    return Err(anyhow!("离线同步响应异常: code={}", result.code));
                }
                let sync: SyncResponse = serde_json::from_value(result.data)?;
                let Some(sess) = sync.sessions.first() else { break };
                if sess.messages.is_empty() {
                    break; // 已追平服务端最新
                }
                server_last_read_id = sess.last_read_id;
                let new_count = apply_sync_session(&me, sess, sess.last_read_id).await?;
                total_new += new_count;
                pulled += 1;
                after = sess.next_cursor;
                if !sess.has_more {
                    break; // 窗口内取尽 → 追平最新 id 或 7 天窗口尽头
                }
            }
            Ok(())
        }
        .await;

        if let Err(e) = pull_result {
            // 单会话失败 → 记失败, 继续下一会话(不阻断整轮)
            failed_sessions += 1;
            error!("[session][sync] 会话追平失败: {}, err={:?}", s.session_uuid, e);
            let _ = crate::dao::sync_task_db::record_forward_catchup(
                batch_id,
                &s.session_uuid,
                SYNC_STATUS_FAILED,
                pulled as i64,
                total_new,
                Some(&e.to_string()),
            )
            .await;
            continue;
        }

        if pulled > 0 {
            // 撤回核对：按会话全量核对一次（幂等），修正同步批次内"撤回先于原消息"等时序遗漏
            if s.session_type == 2 {
                let _ =
                    crate::service::chat_service::reconcile_group_recalls(&s.session_uuid).await;
            } else if let Some(peer) = s.peer_uuid.as_ref().filter(|p| !p.is_empty()) {
                let _ = crate::service::chat_service::reconcile_single_recalls(&me, peer).await;
            }
            // 跨端已读回填: 把服务端 last_read_id 映射到本地水位(只在本地水位更旧时推进)
            if let Err(e) = backfill_read_watermark(&me, s, server_last_read_id).await {
                warn!("[session][sync] 已读水位回填失败: {}, err={:?}", s.session_uuid, e);
            }
            // 先落库再回报(宁重勿漏; 回报失败 → 下轮重拉, nano_id 去重兜住)
            let report = post_request(
                format!("{}/session/synced", talk_api_base()),
                serde_json::to_string(&serde_json::json!({
                    "sessions": [{ "session_uuid": s.session_uuid, "synced_id": after }]
                }))?,
            )
            .await
            .map_err(|e| anyhow!(e));
            if let Err(e) = report {
                failed_sessions += 1;
                error!("[session][sync] 会话追平回报失败: {}, err={:?}", s.session_uuid, e);
                let _ = crate::dao::sync_task_db::record_forward_catchup(
                    batch_id,
                    &s.session_uuid,
                    SYNC_STATUS_FAILED,
                    pulled as i64,
                    total_new,
                    Some(&e.to_string()),
                )
                .await;
                continue;
            }
            synced_sessions += 1;
            let _ = crate::dao::sync_task_db::record_forward_catchup(
                batch_id,
                &s.session_uuid,
                SYNC_STATUS_SUCCESS,
                pulled as i64,
                total_new,
                None,
            )
            .await;
            info!("[session][sync] 会话追平完成: {} (after={})", s.session_uuid, after);
        }
    }
    // 记录有界: 仅保留最近 N 批
    let _ = crate::dao::sync_task_db::prune_batches(SYNC_BATCH_KEEP).await;
    info!(
        "[session][sync] 正向追平完成: {} 个会话有增量, 失败 {} 个",
        synced_sessions, failed_sessions
    );
    Ok(())
}

/// 追平记录批次视图(任务12: `get_sync_history` 命令返回值)。
#[derive(Debug, serde::Serialize)]
pub struct SyncBatchView {
    pub batch_id: i64,
    pub total: i64,
    pub success: i64,
    pub failed: i64,
    pub pending: i64,
    pub tasks: Vec<crate::models::entity::sync_task::SyncTask>,
}

/// 追平记录历史(任务12: `get_sync_history` 命令): 按轮次(batch_id)聚合 + 明细。
pub async fn get_sync_history() -> Result<Vec<SyncBatchView>, anyhow::Error> {
    let summaries = crate::dao::sync_task_db::history().await?;
    let mut out = Vec::with_capacity(summaries.len());
    for s in summaries {
        let tasks = crate::dao::sync_task_db::list_batch_tasks(s.batch_id).await?;
        out.push(SyncBatchView {
            batch_id: s.batch_id,
            total: s.total,
            success: s.success,
            failed: s.failed,
            pending: s.pending,
            tasks,
        });
    }
    Ok(out)
}
