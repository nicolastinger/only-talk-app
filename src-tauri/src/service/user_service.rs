use std::net::SocketAddr;
use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use tauri::Emitter;
use tokio::task::JoinSet;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::cmd::api_controller::{get_request, post_request};
use crate::dao::app_log_db::log_quic_event;
use crate::dao::chat_record_db::{
    insert_chat_record, local_max_server_id, query_read_peers, set_chat_record_server_id,
};
use crate::dao::get_db_client;
use crate::dao::group_chat_record_db::{local_max_group_server_id, set_group_server_id};
use crate::dao::group_message_read::query_group_read_peers;
use crate::dao::init_db::init_sqlite;
use crate::dao::init_private_db::init_private_db;
use crate::dao::session_db::update_chat_session_db;
use crate::dto::http_result::HttpResult;
use crate::entity::app_log::LOG_LEVEL_INFO;
use crate::entity::chat_record_read::{CHAT_TYPE_GROUP, CHAT_TYPE_SINGLE};
use crate::entity::chat_session::ChatSession;
use crate::entity::group_chat_record::GroupChatRecord;
use crate::entity::system_notification::SystemNotification;
use crate::quic_service::center_service::text_quic_client::{spawn_client_loop, stop_client_loop};
use crate::quic_service::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::service::chat_service::process_no_send_success_msg;
use crate::service::friend_service::update_friend_list;
use crate::service::group_service::{parse_http_result, sync_group_list};
use crate::utils::dns::resolve_ipv4;
use crate::utils::global_static_str::{talk_api_base, talk_api_domain};
use crate::utils::session_uuid::single_session_uuid;
use crate::vo::text_quic_msg::TextQuicMsgVo;
use crate::{
    SessionControl, APP_HANDLE, GLOBAL_MSG_SEND_LOCK, GLOBAL_PRIVATE_SQL_POOL,
    GLOBAL_QUIC_SERVER_LIST, GLOBAL_QUIC_USER_INFO, GLOBAL_SQL_POOL, MEDIA_DATA_CANCEL_TOKEN,
    SESSION_CONTROL,
};

/// 从服务端拉取当前用户+设备 唯一的本地加密库密钥(按 user_id + 设备指纹签发)
async fn fetch_private_db_key() -> Result<String, anyhow::Error> {
    let url = format!("{}/user/sqlite_key/fetch", talk_api_base());
    // 设备指纹为小写 hex，无需额外转义
    let body = format!(
        "{{\"device_fingerprint\":\"{}\"}}",
        crate::utils::device_info::device_fingerprint()
    );
    let result = post_request(url, body).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = serde_json::from_str(&result.body)?;
    if response.code != 200 {
        return Err(anyhow!("获取数据库密钥失败: {}", response.message));
    }
    let db_key = response
        .data
        .get("db_key")
        .and_then(|v| v.as_str())
        .ok_or(anyhow!("获取数据库密钥响应缺少 db_key"))?
        .to_string();
    Ok(db_key)
}

/// 登录会话的任务执行(由会话状态机 actor 在 LoggingIn 阶段调用)
pub(crate) async fn perform_session_login_tasks() -> Result<(), anyhow::Error> {
    info!("[session][login] 开始登录任务: LoggingIn 阶段资源装载");

    info!("[session][login] 步骤1/6 拉取本设备私库密钥(user+设备指纹签发)");
    let db_key = fetch_private_db_key().await.map_err(|e| {
        error!("[session][login] 拉取私库密钥失败: {:?}", e);
        e
    })?;
    insert_user_info("private_db_key", &db_key).await?;
    info!("[session][login] 步骤1/6 完成: 私库密钥已装载(仅内存)");

    info!("[session][login] 步骤2/6 初始化明文 user 库");
    init_sqlite().await.map_err(|e| {
        error!("[session][login] 初始化 user 库失败: {:?}", e);
        e
    })?;
    info!("[session][login] 步骤2/6 完成: user 库就绪");

    info!("[session][login] 步骤3/6 初始化加密 private 库(聊天记录存储)");
    init_private_db().await.map_err(|e| {
        error!("[session][login] 初始化 private 库失败: {:?}", e);
        e
    })?;
    info!("[session][login] 步骤3/6 完成: private 库就绪");

    info!("[session][login] 步骤4/6 同步好友/群聊/离线消息/会话列表/未读通知");
    update_friend_list().await.unwrap_or_else(|e| {
        error!("[session][login] 同步好友列表失败(继续): {:?}", e);
    });
    sync_group_list().await.unwrap_or_else(|e| {
        error!("[session][login] 同步群聊列表失败(继续): {:?}", e);
    });
    // 任务12 简化: refresh 落会话事实(last_message_id) → 串行正向追平
    refresh_and_forward().await;
    get_unread_notification().await.unwrap_or_else(|e| {
        error!("[session][login] 拉取未读通知失败(继续): {:?}", e);
    });
    info!("[session][login] 步骤4/6 完成");

    info!("[session][login] 步骤5/6 启动 QUIC 客户端连接循环");
    {
        *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Disconnected;
        tokio::spawn(async move {
            let addr = discover_quic_server_addr().await;
            info!("[session][login] QUIC 服务器地址已解析: {}, 启动连接循环", addr);
            spawn_client_loop(addr).await;
        });
    }
    info!("[session][login] 步骤5/6 完成: QUIC 连接循环已派发");

    info!("[session][login] 步骤6/6 注册会话级后台任务 supervisor");
    {
        // 若上一个会话的控制句柄尚未清干净(异常路径), 先取消等待其退出
        if let Some(old) = SESSION_CONTROL.write().await.take() {
            info!("[session][login] 发现上一个会话残留句柄, 先取消等待退出");
            old.cancel.cancel();
            let _ = old.handle.await;
        }
        let cancel = CancellationToken::new();
        let task_cancel = cancel.clone();
        let handle = tokio::spawn(async move {
            if let Err(e) = start_session_tasks(task_cancel).await {
                error!("[session][task] 会话定时任务异常退出: {:?}", e);
            }
        });
        *SESSION_CONTROL.write().await = Some(SessionControl { cancel, handle });
    }
    info!("[session][login] 步骤6/6 完成: supervisor 已注册");

    info!("[session][login] 全部步骤完成, 会话就绪, 待迁移 LoggedIn");
    Ok(())
}

/// 用户登录入口(会话状态机 actor): LoggedOut -> LoggingIn -> LoggedIn
pub async fn user_login() -> Result<(), anyhow::Error> {
    crate::service::session_manager::SESSION_MANAGER.login().await
}

/// 获取用户信息
pub async fn get_user_info(key: &str) -> Result<String, anyhow::Error> {
    let guard = GLOBAL_QUIC_USER_INFO.read().await;
    match guard.get(key) {
        Some(value) => Ok(value.clone()),
        None => Err(anyhow!("数据不存在")),
    }
}

/// 插入用户信息
pub async fn insert_user_info(key: &str, value: &str) -> Result<(), anyhow::Error> {
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 会话级后台任务监督。
///
/// 10s 预热后写入 schedule_key，托管「已读上报」「通知已读上报」两个长循环，
/// 并周期性派发「未发送消息重发」子任务。退出登录时 teardown_session 触发 cancel：
/// JoinSet abort 全部子任务并 await，保证该会话后台任务彻底退出，不残留跨会话执行。
pub async fn start_session_tasks(cancel: CancellationToken) -> Result<(), anyhow::Error> {
    tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        _ = tokio::time::sleep(Duration::from_secs(10)) => {}
    }
    let schedule_key = uuid::Uuid::new_v4().to_string();
    // 设置定时任务key
    insert_user_info("schedule_key", &schedule_key).await?;
    info!("[session][task] 定时任务key: {}, 启动", schedule_key);

    let mut set = JoinSet::new();
    let read_task_key = schedule_key.clone();
    set.spawn(async move {
        send_read_message(read_task_key).await.expect("消息已读任务失败");
    });
    let notify_task_key = schedule_key.clone();
    set.spawn(async move {
        send_notify_read_message(notify_task_key).await.expect("通知已读上报任务失败");
    });

    let mut count = 0u64;
    loop {
        count += 1;
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("[session][task] 收到取消, 停止会话后台任务(abort 子任务并等待退出)");
                set.abort_all();
                while let Some(result) = set.join_next().await {
                    if let Err(e) = result {
                        warn!("会话定时任务子任务退出异常: {:?}", e);
                    }
                }
                return Ok(());
            }
            _ = tokio::time::sleep(Duration::from_secs(1)) => {}
        }
        // 回收已完成子任务(避免 JoinSet 堆积已完成句柄)
        while set.try_join_next().is_some() {}
        // 校验定时任务key: 会话已被替换时自然退出
        let result = check_schedule_key(&schedule_key).await;
        if result.is_err() {
            error!("[session][task] schedule_key 不匹配, 会话任务自愈退出");
            break;
        }
        // 10秒触发一次: 处理未发送消息
        if count % 10 == 0 {
            set.spawn(async move {
                timeout(Duration::from_secs(10), async {
                    let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
                    process_no_send_success_msg().await.expect("处理未发送消息失败");
                })
                .await
                .expect("定时任务，处理未发送消息超时");
            });
        }
    }
    info!("[session][task] 会话后台任务监督结束");
    Ok(())
}

// 校验定时任务key
pub async fn check_schedule_key(key: &str) -> Result<(), anyhow::Error> {
    let schedule_key = get_user_info("schedule_key").await;
    match schedule_key {
        Ok(schedule_key) => {
            if key != schedule_key {
                return Err(anyhow!("定时任务key不匹配"));
            }
        }
        Err(err) => {
            error!("获取定时任务key失败 {:?}", err);
            return Err(err);
        }
    }
    Ok(())
}

// 发送已读消息(任务07): 按会话聚合, 上报本地 max(server_id) 游标
pub async fn send_read_message(key: String) -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;

    let mut timestamp = 0; // 单聊已读事件水位
    let mut group_timestamp = 0; // 群聊已读事件水位
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

        let mut reads: Vec<serde_json::Value> = Vec::new();

        // 单聊: 按对端聚合 → 派生 session_uuid → 本地 max(server_id)
        for (peer, ts) in query_read_peers(&uuid, timestamp).await? {
            if ts > timestamp {
                timestamp = ts;
            }
            let su = match (Uuid::parse_str(&uuid), Uuid::parse_str(&peer)) {
                (Ok(a), Ok(b)) => single_session_uuid(&a, &b).to_string(),
                _ => continue,
            };
            // 在线消息无 server_id → max 可能为 None/0 → 本次跳过(低估自愈, 见任务07 §5.1)
            if let Some(max_id) = local_max_server_id(&uuid, &peer).await? {
                if max_id > 0 {
                    reads.push(serde_json::json!({
                        "session_uuid": su,
                        "session_type": CHAT_TYPE_SINGLE,
                        "last_read_id": max_id,
                    }));
                }
            }
        }

        // 群聊: group_uuid 即 session_uuid
        for (group, ts) in query_group_read_peers(&uuid, group_timestamp).await? {
            if ts > group_timestamp {
                group_timestamp = ts;
            }
            if let Some(max_id) = local_max_group_server_id(&group).await? {
                if max_id > 0 {
                    reads.push(serde_json::json!({
                        "session_uuid": group,
                        "session_type": CHAT_TYPE_GROUP,
                        "last_read_id": max_id,
                    }));
                }
            }
        }

        if !reads.is_empty() {
            info!("发送已读消息(会话游标) {:?}", reads);
            match post_request(
                format!("{}/session/read", talk_api_base()),
                serde_json::to_string(&serde_json::json!({ "reads": reads }))
                    .expect("序列化已读消息失败"),
            )
            .await
            {
                Ok(m) => info!("发送已读消息成功 {:?}", m.body),
                Err(e) => error!("发送已读消息失败 {:?}", e),
            }
        }
        count += 1;
        tokio::time::sleep(Duration::from_secs(10)).await;
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
            match post_request(
                format!("{}/notify/mark_read", talk_api_base()),
                serde_json::to_string(&read_ids).expect("序列化通知已读失败"),
            )
            .await
            {
                Ok(m) => {
                    let result =
                        serde_json::from_str::<HttpResult>(&m.body).unwrap_or(HttpResult {
                            code: -1,
                            message: String::new(),
                            data: serde_json::Value::Null,
                        });
                    if result.code == 200 || result.code == 204 {
                        SystemNotification::mark_read_synced(&uuid, &read_ids).await?;
                        info!("通知已读上报成功: {:?}", read_ids);
                    } else {
                        error!("通知已读上报失败: {}", result.message);
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
    let result = serde_json::from_str::<HttpResult>(&data)?;
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
async fn refresh_and_forward() {
    match refresh_session_list().await {
        Ok(sessions) => {
            if let Err(e) = sync_sessions_forward(&sessions).await {
                error!("[session][sync] 离线消息正向追平失败 {:?}", e);
            }
        }
        Err(e) => error!("[session][sync] 刷新会话列表失败 {:?}", e),
    }
}

// ===== 任务12: 离线同步(正向追平, 客户端游标驱动) =====

/// 单会话单次正向拉取条数。
const SYNC_PULL_LIMIT: u32 = 100;
/// 追平记录保留批数(每轮重连 = 一批)。
const SYNC_BATCH_KEEP: i64 = 50;

#[derive(Debug, serde::Deserialize)]
struct SyncResponse {
    #[allow(dead_code)]
    server_time: i64,
    sessions: Vec<SyncSession>,
}

#[derive(Debug, serde::Deserialize)]
struct SyncSession {
    #[allow(dead_code)]
    session_uuid: String,
    session_type: i16,
    messages: Vec<SyncMessage>,
    next_cursor: i64,
    has_more: bool,
}

#[derive(Debug, serde::Deserialize)]
struct SyncMessage {
    id: i64,
    nano_id: String,
    #[allow(dead_code)]
    session_uuid: String,
    #[allow(dead_code)]
    session_type: i16,
    send_user: String,
    recv_user: String,
    text_type: u16,
    timestamp: i64,
    raw: Vec<u8>,
}

/// 会话列表响应(任务06 §4.1)
#[derive(Debug, serde::Deserialize)]
struct SessionListResponse {
    sessions: Vec<SessionListItem>,
    has_more: bool,
    next_cursor: Option<SessionListCursor>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct SessionListItem {
    session_uuid: String,
    session_type: i16,
    peer_uuid: Option<String>,
    last_message_id: i64,
    last_message_at: i64,
    last_preview: String,
    pinned: i16,
    #[allow(dead_code)]
    muted: i16,
    unread: i64,
}

#[derive(Debug, serde::Deserialize)]
struct SessionListCursor {
    pinned: i16,
    last_message_at: i64,
    session_uuid: String,
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
    let batch_id = crate::utils::time::get_now_time_stamp_as_millis()?;
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
                let new_count = apply_sync_session(&me, sess).await?;
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
                crate::entity::sync_task::SYNC_STATUS_FAILED,
                pulled as i64,
                total_new,
                Some(&e.to_string()),
            )
            .await;
            continue;
        }

        if pulled > 0 {
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
                    crate::entity::sync_task::SYNC_STATUS_FAILED,
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
                crate::entity::sync_task::SYNC_STATUS_SUCCESS,
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
    pub tasks: Vec<crate::entity::sync_task::SyncTask>,
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

/// 应用一批同步结果: 落库(nano_id 去重) + 回写 server_id + 更新会话表; 返回本批新增消息数。
async fn apply_sync_session(me: &str, s: &SyncSession) -> Result<i64, anyhow::Error> {
    let mut new_count = 0i64;
    for msg in &s.messages {
        if s.session_type == 1 {
            if insert_single_sync_message(me, msg).await? {
                new_count += 1;
            }
        } else if insert_group_sync_message(me, msg).await? {
            new_count += 1;
        }
    }
    Ok(new_count)
}

/// 单聊同步消息落库(复用 insert_chat_record 去重链); 返回是否新增。
async fn insert_single_sync_message(me: &str, msg: &SyncMessage) -> Result<bool, anyhow::Error> {
    let vo = TextQuicMsgVo {
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: String::from_utf8_lossy(&msg.raw).to_string(),
        recv_user: msg.recv_user.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
    };
    let is_new = insert_chat_record(&vo).await?;
    set_chat_record_server_id(&msg.nano_id, msg.id).await?;

    let peer = if msg.send_user == me { msg.recv_user.clone() } else { msg.send_user.clone() };
    let session_uuid = match (Uuid::parse_str(me), Uuid::parse_str(&peer)) {
        (Ok(a), Ok(b)) => single_session_uuid(&a, &b).to_string(),
        _ => String::new(),
    };
    let is_received = msg.recv_user == me;
    let chat_session = ChatSession {
        id: 0,
        nano_id: msg.nano_id.clone(),
        timestamp: msg.timestamp,
        text_type: msg.text_type,
        unread_count: if is_new && is_received { 1 } else { 0 },
        last_message: vo.raw.clone(),
        recv_user: me.to_string(),
        send_user: peer,
        session_type: 1,
        is_show: 1,
        is_top: 0,
        group_id: None,
        session_uuid: Some(session_uuid),
        last_message_id: msg.id,
    };
    update_chat_session_db(&chat_session).await?;
    Ok(is_new)
}

/// 群聊同步消息落库(recv_user 即 group_uuid); 返回是否新增。
async fn insert_group_sync_message(me: &str, msg: &SyncMessage) -> Result<bool, anyhow::Error> {
    let group_id = msg.recv_user.clone();
    let raw = String::from_utf8_lossy(&msg.raw).to_string();
    let record = GroupChatRecord {
        id: 0,
        nano_id: msg.nano_id.clone(),
        text_type: msg.text_type,
        raw: raw.clone(),
        group_id: group_id.clone(),
        send_user: msg.send_user.clone(),
        timestamp: msg.timestamp,
        server_id: None,
    };
    let is_new = GroupChatRecord::insert(&record).await?;
    set_group_server_id(&msg.nano_id, msg.id).await?;

    let chat_session = ChatSession {
        id: 0,
        nano_id: msg.nano_id.clone(),
        timestamp: msg.timestamp,
        text_type: msg.text_type,
        unread_count: if is_new && msg.send_user != me { 1 } else { 0 },
        last_message: raw,
        recv_user: me.to_string(),
        send_user: group_id.clone(),
        session_type: 2,
        is_show: 1,
        is_top: 0,
        group_id: Some(group_id.clone()),
        session_uuid: Some(group_id),
        last_message_id: msg.id,
    };
    update_chat_session_db(&chat_session).await?;
    Ok(is_new)
}

/// 拉取 /session/list 并把服务端状态合并进本地会话表(任务07 §5.6)。
///
/// 返回全量会话 —— 客户端据此做正向追平: 每会话 `target = last_message_id`。
async fn refresh_session_list() -> Result<Vec<SessionListItem>, anyhow::Error> {
    let me = get_user_info("uuid").await?;
    let mut all = Vec::new();
    let mut cursor: Option<serde_json::Value> = None;
    loop {
        let body = serde_json::json!({ "cursor": cursor, "size": 50 });
        let resp = post_request(format!("{}/session/list", talk_api_base()), body.to_string())
            .await
            .map_err(|e| anyhow!(e))?;
        let result: HttpResult = parse_http_result(&resp.body)?;
        if result.code != 200 || result.data.is_null() {
            break;
        }
        let list: SessionListResponse = serde_json::from_value(result.data)?;
        for s in &list.sessions {
            merge_local_session(&me, s).await?;
            all.push(s.clone());
        }
        if !list.has_more {
            break;
        }
        cursor = list.next_cursor.map(|c| {
            serde_json::json!({
                "pinned": c.pinned,
                "last_message_at": c.last_message_at,
                "session_uuid": c.session_uuid,
            })
        });
        if cursor.is_none() {
            break;
        }
    }
    Ok(all)
}

/// 把一条服务端会话合并进本地 chat_session(不覆盖本地角标; 落会话事实 last_message_id)。
async fn merge_local_session(me: &str, s: &SessionListItem) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let peer_or_group = match s.session_type {
        2 => s.session_uuid.clone(),
        _ => s.peer_uuid.clone().unwrap_or_default(),
    };
    let group_id = if s.session_type == 2 { Some(s.session_uuid.clone()) } else { None };
    let res = sqlx::query(
        r#"UPDATE chat_session SET session_uuid = ?1, is_top = ?2, last_message = ?3, timestamp = ?4, last_message_id = ?5 WHERE recv_user = ?6 AND send_user = ?7 AND session_type = ?8"#,
    )
    .bind(&s.session_uuid)
    .bind(s.pinned)
    .bind(&s.last_preview)
    .bind(s.last_message_at)
    .bind(s.last_message_id)
    .bind(me)
    .bind(&peer_or_group)
    .bind(s.session_type as i64)
    .execute(&pool_sqlite)
    .await?;
    if res.rows_affected() < 1 {
        // 本地尚无该会话(如好友通过预建、无本地消息): 建一行, 角标沿用服务端
        sqlx::query(
            r#"INSERT INTO chat_session (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user, session_type, is_show, is_top, group_id, session_uuid, last_message_id) VALUES ('', ?1, 0, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10)"#,
        )
        .bind(s.last_message_at)
        .bind(s.unread)
        .bind(&s.last_preview)
        .bind(&peer_or_group)
        .bind(me)
        .bind(s.session_type as i64)
        .bind(s.pinned)
        .bind(&group_id)
        .bind(&s.session_uuid)
        .bind(s.last_message_id)
        .execute(&pool_sqlite)
        .await?;
    }
    Ok(())
}

pub async fn get_user_map(key: &str) -> Result<String, String> {
    Ok(GLOBAL_QUIC_USER_INFO.read().await.get(key).cloned().ok_or("not found")?.to_string())
}

pub async fn add_user_map(key: &str, value: &str) -> Result<(), String> {
    GLOBAL_QUIC_USER_INFO.write().await.insert(key.to_string(), value.to_string());
    Ok(())
}

/// 登出会话的任务执行(由会话状态机 actor 在 LoggingOut 阶段调用)。幂等。
pub(crate) async fn perform_session_logout_tasks() -> Result<(), anyhow::Error> {
    info!("[session][logout] 开始登出任务: LoggingOut 阶段资源释放");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "开始清理当前登录会话", "").await;

    // 1. 停 QUIC 连接循环(需在用户信息与 user 库仍在时执行: 内部写断开标记并落事件日志)
    let has_quic_session = {
        let state = *GLOBAL_QUIC_STATE.read().await;
        let has_conns = !GLOBAL_QUIC_SERVER_LIST.read().await.is_empty();
        state != QuicConnectionState::Idle || has_conns
    };
    if has_quic_session {
        info!("[session][logout] 步骤1/6 断开 QUIC 连接循环");
        if let Err(e) = disconnect_quic().await {
            warn!("[session][logout] 断开 QUIC 失败(继续清理): {:?}", e);
        } else {
            info!("[session][logout] 步骤1/6 完成: QUIC 已断开(状态 Idle)");
        }
    } else {
        info!("[session][logout] 步骤1/6 跳过: QUIC 本就空闲(无连接)");
    }

    // 2. 停止会话级定时任务(cancel + await, 子任务 JoinSet abort 后彻底退出)
    if let Some(ctl) = SESSION_CONTROL.write().await.take() {
        info!("[session][logout] 步骤2/6 取消会话后台任务并等待退出");
        ctl.cancel.cancel();
        let waited = timeout(Duration::from_secs(15), ctl.handle).await;
        if waited.is_err() {
            warn!("[session][logout] 步骤2/6 等待后台任务退出超时(15s)");
        } else {
            info!("[session][logout] 步骤2/6 完成: 会话后台任务已全部退出");
        }
    } else {
        info!("[session][logout] 步骤2/6 跳过: 无会话后台任务");
    }

    // 3. 取消在途媒体/视频通话帧发送
    if let Some(token) = MEDIA_DATA_CANCEL_TOKEN.write().await.take() {
        token.cancel();
        info!("[session][logout] 步骤3/6 完成: 已取消在途媒体/视频帧发送");
    } else {
        info!("[session][logout] 步骤3/6 跳过: 无在途媒体");
    }

    // 4. 状态复位
    *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Idle;
    info!("[session][logout] 步骤4/6 完成: QUIC 状态复位为 Idle");

    // 5. 清空用户信息与服务器连接列表
    GLOBAL_QUIC_USER_INFO.write().await.clear();
    GLOBAL_QUIC_SERVER_LIST.write().await.clear();
    info!("[session][logout] 步骤5/6 完成: 用户信息与服务器连接列表已清空");

    // 6. 关闭明文/加密用户库连接(保留 common 库供免登录用户列表使用)
    GLOBAL_SQL_POOL.write().await.take();
    GLOBAL_PRIVATE_SQL_POOL.write().await.take();
    info!("[session][logout] 步骤6/6 完成: user/private 库连接已关闭(保留 common 库)");

    info!("[session][logout] 全部步骤完成, 待迁移 LoggedOut");
    Ok(())
}

/// 登出入口(会话状态机 actor): LoggedIn -> LoggingOut -> LoggedOut, 幂等
pub async fn teardown_session() -> Result<(), anyhow::Error> {
    crate::service::session_manager::SESSION_MANAGER.logout().await
}

/// 断开QUIC连接
/// 设置状态为 Idle 停止重连循环，清理连接资源
pub async fn disconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始断开QUIC连接");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "开始断开QUIC连接", "").await;

    // 设置状态为 Idle，停止 run_client 重连循环
    *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Idle;

    // 手动断开时主动通知前端，触发 topbar 断连提示
    // （run_client 检测到 Idle 会直接返回，不会进入 Disconnected 广播 quic_disconnected）
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("quic_disconnected", "QUIC 连接已手动断开");
    }

    // 清除服务器连接列表
    {
        let mut server_list = GLOBAL_QUIC_SERVER_LIST.write().await;
        for connection in server_list.values() {
            connection.conn.close(0u32.into(), b"client disconnect");
        }
        server_list.clear();
        info!("已清理QUIC服务器连接列表");
        let _ =
            log_quic_event(LOG_LEVEL_INFO, "user_service", "已清理QUIC服务器连接列表", "").await;
    }

    // 标记用户离线状态
    {
        insert_user_info("quic_disconnected", "true").await?;
        insert_user_info("ping_lost_count", "0").await?;
        insert_user_info("last_pong_time", "0").await?;
        let ping_uuid = Uuid::new_v4();
        let ping_uuid = ping_uuid.to_string();
        insert_user_info("ping_uuid", &ping_uuid).await?;
        info!("已标记QUIC断开状态");
    }

    // 作废代次 + 取消 in-flight 握手/等待，确保连接循环彻底退出（旧 endpoint 已 drop）
    stop_client_loop().await;

    info!("QUIC连接已断开（状态: Idle）");
    let _ =
        log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC连接已断开（状态: Idle）", "").await;
    Ok(())
}

/// 重新连接QUIC服务
/// 如果 run_client 循环仍在运行，先停止再重启
pub async fn reconnect_quic() -> Result<(), anyhow::Error> {
    info!("开始重新连接QUIC服务");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "开始重新连接QUIC服务", "").await;

    // 先断开现有连接（设 Idle 会停止当前循环）
    disconnect_quic().await?;

    // 清除断开状态标记
    {
        let mut user_info = GLOBAL_QUIC_USER_INFO.write().await;
        user_info.insert("quic_disconnected".to_string(), "false".to_string());
    }

    // 重新启动连接循环（disconnect_quic 已保证旧循环彻底退出）
    *GLOBAL_QUIC_STATE.write().await = QuicConnectionState::Disconnected;
    tokio::spawn(async move {
        let addr = discover_quic_server_addr().await;
        spawn_client_loop(addr).await;
        info!("QUIC连接循环已启动/重建");
        let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC连接循环已启动/重建", "").await;
    });

    info!("QUIC重连请求已发送");
    let _ = log_quic_event(LOG_LEVEL_INFO, "user_service", "QUIC重连请求已发送", "").await;
    Ok(())
}

/// 通过 HTTP API 发现可用的外网 QUIC 服务器地址
/// 优先从 Redis 获取，失败时回退到 DNS 解析
async fn discover_quic_server_addr() -> SocketAddr {
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct QuicServerInfo {
        #[allow(dead_code)]
        index: u32,
        address: String,
    }

    #[derive(Deserialize)]
    struct ApiResult {
        #[allow(dead_code)]
        code: u16,
        data: QuicServerInfo,
    }

    // 尝试通过 API 获取 QUIC 服务器列表
    let url = format!("{}/integrated/quic_servers", talk_api_base());
    match get_request(url).await {
        Ok(response) => match serde_json::from_str::<ApiResult>(&response.body) {
            Ok(result) => {
                let server = result.data;
                info!("通过API发现QUIC服务器: index={} -> {}", server.index, server.address);
                if let Ok(addr) = server.address.parse::<SocketAddr>() {
                    return addr;
                }
                warn!("API返回的QUIC服务器地址无效，回退到DNS解析");
            }
            Err(e) => {
                warn!("解析QUIC服务器列表失败: {}，回退到DNS解析", e);
            }
        },
        Err(e) => {
            warn!("获取QUIC服务器列表失败: {}，回退到DNS解析", e);
        }
    }

    // 回退：DNS 解析默认域名
    SocketAddr::V4(resolve_ipv4(&talk_api_domain(), 4433).await.expect("解析域名失败"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 任务07 §8.1: /session/sync 响应结构完整解析。
    #[test]
    fn sync_response_parse() {
        let json = r#"{
            "server_time": 1758000000000,
            "sessions": [{
                "session_uuid": "3f2b",
                "session_type": 1,
                "messages": [{
                    "id": 12345,
                    "nano_id": "n1",
                    "session_uuid": "3f2b",
                    "session_type": 1,
                    "send_user": "a",
                    "recv_user": "b",
                    "text_type": 1,
                    "timestamp": 1757999999000,
                    "raw": [104, 105]
                }],
                "next_cursor": 12345,
                "has_more": false
            }]
        }"#;
        let resp: SyncResponse = serde_json::from_str(json).expect("解析 SyncResponse 失败");
        assert_eq!(resp.sessions.len(), 1);
        let s = &resp.sessions[0];
        assert_eq!(s.session_uuid, "3f2b");
        assert_eq!(s.session_type, 1);
        assert_eq!(s.messages.len(), 1);
        assert_eq!(s.messages[0].id, 12345);
        assert_eq!(s.messages[0].raw, vec![104, 105]);
        assert_eq!(s.next_cursor, 12345);
        assert!(!s.has_more);
    }

    /// 任务07 §8.1: /session/list 响应结构完整解析。
    #[test]
    fn session_list_response_parse() {
        let json = r#"{
            "sessions": [{
                "session_uuid": "su1",
                "session_type": 1,
                "peer_uuid": "p1",
                "last_message_id": 9,
                "last_message_at": 1758000000000,
                "last_preview": "hi",
                "pinned": 1,
                "muted": 0,
                "unread": 2
            }],
            "has_more": true,
            "next_cursor": { "pinned": 1, "last_message_at": 1758000000000, "session_uuid": "su1" }
        }"#;
        let resp: SessionListResponse = serde_json::from_str(json).expect("解析 SessionList 失败");
        assert_eq!(resp.sessions.len(), 1);
        assert!(resp.has_more);
        let c = resp.next_cursor.expect("应有游标");
        assert_eq!(c.session_uuid, "su1");
        assert_eq!(c.pinned, 1);
    }
}
