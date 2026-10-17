//! 登录/登出会话生命周期与后台任务监督。

use std::time::Duration;

use anyhow::anyhow;
use log::{error, info, warn};
use tokio::task::JoinSet;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use super::quic::{disconnect_quic, discover_quic_server_addr};
use super::read_report::{get_unread_notification, send_notify_read_message, send_read_message};
use super::sync::refresh_and_forward;
use crate::dao::app_log_db::log_quic_event;
use crate::dao::init_db::init_sqlite;
use crate::dao::init_private_db::init_private_db;
use crate::models::dto::http_result::HttpResult;
use crate::models::entity::app_log::LOG_LEVEL_INFO;
use crate::quic_core::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::service::api_service::{parse_http_result, post_request};
use crate::service::chat_service::process_no_send_success_msg;
use crate::service::client_loop::spawn_client_loop;
use crate::service::friend_service::update_friend_list;
use crate::service::group_service::sync_group_list;
use crate::utils::global_static_str::talk_api_base;
use crate::utils::user_state::{get_user_info, insert_user_info};
use crate::{
    SessionControl, GLOBAL_MSG_SEND_LOCK, GLOBAL_PRIVATE_SQL_POOL, GLOBAL_QUIC_SERVER_LIST,
    GLOBAL_QUIC_USER_INFO, GLOBAL_SQL_POOL, MEDIA_DATA_CANCEL_TOKEN, SESSION_CONTROL,
};

/// 从服务端拉取当前用户+设备 唯一的本地加密库密钥(由 user_id + 设备指纹签发)
async fn fetch_private_db_key() -> Result<String, anyhow::Error> {
    let url = format!("{}/user/sqlite_key/fetch", talk_api_base());
    // 设备指纹为小写 hex，无需额外转义
    let body = format!(
        "{{\"device_fingerprint\":\"{}\"}}",
        crate::utils::device_info::device_fingerprint()
    );
    let result = post_request(url, body).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;
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
    let schedule_key = Uuid::new_v4().to_string();
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
pub(super) async fn check_schedule_key(key: &str) -> Result<(), anyhow::Error> {
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
