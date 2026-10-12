use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use log::{info, warn};
use tokio::sync::Mutex;

use crate::dao::chat_record_send::query_record_send_from_db;
use crate::quic_service::connection_state::{QuicConnectionState, GLOBAL_QUIC_STATE};
use crate::service::chat_service::send_msg;
use crate::{GLOBAL_MSG_SEND_LOCK, GLOBAL_QUIC_SERVER_LIST};

/// 单条待补发消息（QUIC 报文已生成）
pub struct QueuedSend {
    /// 本地发送记录 id（即 nano_id），用于日志与发送前去重检查
    pub send_id: String,
    /// 已序列化的 QUIC 消息报文
    pub msg: Vec<u8>,
}

/// 全局离线发送缓存队列：重连期间用户发送的消息先入队，上线后慢速逐条补发。
/// 仅内存缓存；消息本体已持久化到 chat_record_send / group_message_ack，
/// 进程重启后由定时补发任务（process_no_send_success_msg）兜底，不会丢消息。
pub static GLOBAL_MSG_SEND_QUEUE: LazyLock<Arc<Mutex<VecDeque<QueuedSend>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(VecDeque::new())));

/// 消费循环是否正在运行（避免重连多次触发并发消费）
static DRAIN_RUNNING: AtomicBool = AtomicBool::new(false);

/// 每条消息补发间隔：控制"慢速消费"节奏
const DRAIN_INTERVAL: Duration = Duration::from_millis(300);

/// 是否处于重连状态（Connecting / Disconnected），此时发送应进入缓存队列
pub async fn should_queue_on_offline() -> bool {
    let state = *GLOBAL_QUIC_STATE.read().await;
    matches!(state, QuicConnectionState::Connecting | QuicConnectionState::Disconnected)
}

/// 消息入队（重连期间调用）
pub async fn enqueue(send_id: String, msg: Vec<u8>) {
    GLOBAL_MSG_SEND_QUEUE.lock().await.push_back(QueuedSend { send_id, msg });
}

/// 消费离线发送队列：逐条慢速补发，队列清空或连接再次断开即停止。
/// 每条发送前检查 send 记录状态，非排队/发送中(0/1)则跳过（避免与定时补发重复）。
/// 群聊消息不在 chat_record_send 表（查不到记录），直接发送。
pub async fn drain_send_queue() {
    if DRAIN_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    loop {
        let queued = { GLOBAL_MSG_SEND_QUEUE.lock().await.pop_front() };
        let Some(queued) = queued else { break };

        let state = *GLOBAL_QUIC_STATE.read().await;
        if state != QuicConnectionState::Connected {
            // 连接再次断开：放回队首，等下次上线再补发
            GLOBAL_MSG_SEND_QUEUE.lock().await.push_front(queued);
            break;
        }

        // 已确认(3)/失败(2)/已忽略(-1)则跳过，避免与定时补发重复发送
        if let Ok(record) = query_record_send_from_db(&queued.send_id).await {
            if record.send_status > 1 || record.send_status < 0 {
                continue;
            }
        }

        let conn = {
            let server_book = GLOBAL_QUIC_SERVER_LIST.read().await;
            server_book.get("SERVER_TEXT").map(|c| c.conn.clone())
        };
        let Some(conn) = conn else {
            GLOBAL_MSG_SEND_QUEUE.lock().await.push_front(queued);
            break;
        };

        let _lock = GLOBAL_MSG_SEND_LOCK.lock().await;
        match send_msg(queued.msg.clone(), &conn).await {
            Ok(_) => info!("[send_queue] 补发离线消息成功: {}", queued.send_id),
            Err(e) => {
                warn!("[send_queue] 补发离线消息失败，暂停本轮: {} err={:?}", queued.send_id, e);
                GLOBAL_MSG_SEND_QUEUE.lock().await.push_front(queued);
                break;
            }
        }
        drop(_lock);

        tokio::time::sleep(DRAIN_INTERVAL).await;
    }

    DRAIN_RUNNING.store(false, Ordering::SeqCst);
}
