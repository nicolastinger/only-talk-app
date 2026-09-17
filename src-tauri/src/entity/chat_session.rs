use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;
use crate::vo::chat_session_vo::ChatSessionVo;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatSession {
    pub id: i64,
    pub nano_id: String,
    pub timestamp: i64,
    pub text_type: u16,
    pub unread_count: i64,
    pub last_message: String,
    pub recv_user: String,
    pub send_user: String,
    pub session_type: i64, //1-单聊，2-群聊，3-系统，4-公众号
    pub is_show: i64,
    pub is_top: i64,
    pub group_id: Option<String>,
    /// 会话标识: 单聊由用户对 v5 派生 / 群聊 = group_id
    pub session_uuid: Option<String>,
    /// 会话事实: 服务端该会话最新消息 id(来自 /session/list); 缺口检测输入(任务12)
    pub last_message_id: i64,
}

impl ChatSession {
    /// 单聊会话归一化：确保 send_user=对方、recv_user=我（与我方库内规范一致）。
    /// 群聊(session_type=2)以群id作 send_user，系统/公众号不会等于我，均原样返回；
    /// 自己的笔记会话 send==recv==我，无需交换。
    pub fn to_canonical(mut self, me: &str) -> ChatSession {
        if self.session_type != 2 && self.send_user == me && self.send_user != self.recv_user {
            std::mem::swap(&mut self.send_user, &mut self.recv_user);
        }
        self
    }

    pub fn from(chat_session_vo: ChatSessionVo) -> Result<Self, anyhow::Error> {
        Ok(ChatSession {
            id: 0,
            nano_id: chat_session_vo.nano_id,
            timestamp: chat_session_vo.timestamp,
            text_type: chat_session_vo.text_type,
            unread_count: chat_session_vo.unread_count,
            last_message: chat_session_vo.last_message,
            recv_user: chat_session_vo.recv_user,
            send_user: chat_session_vo.send_user,
            session_type: chat_session_vo.session_type,
            is_show: chat_session_vo.is_show,
            is_top: chat_session_vo.is_top,
            group_id: chat_session_vo.group_id,
            session_uuid: chat_session_vo.session_uuid,
            last_message_id: chat_session_vo.last_message_id,
        })
    }
}

impl SqliteStore for ChatSession {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS chat_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            text_type INTEGER NOT NULL DEFAULT 0,
            unread_count INTEGER NOT NULL DEFAULT 0,
            last_message TEXT NOT NULL,
            is_show INTEGER NOT NULL DEFAULT 1,
            is_top INTEGER NOT NULL DEFAULT 0,
            session_type INTEGER NOT NULL DEFAULT 0,
            session_uuid TEXT DEFAULT NULL,
            last_message_id INTEGER NOT NULL DEFAULT 0,
            UNIQUE(send_user, recv_user),
            UNIQUE(session_uuid)
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        let _ = sqlx::query("ALTER TABLE chat_session ADD COLUMN group_id TEXT DEFAULT NULL")
            .execute(pool_sqlite)
            .await; // Column already exists, ignore
        let _ = sqlx::query("ALTER TABLE chat_session ADD COLUMN session_uuid TEXT DEFAULT NULL")
            .execute(pool_sqlite)
            .await; // Column already exists, ignore
        let _ = sqlx::query(
            "ALTER TABLE chat_session ADD COLUMN last_message_id INTEGER NOT NULL DEFAULT 0",
        )
        .execute(pool_sqlite)
        .await; // Column already exists, ignore
        // 任务12: 会话域收口 —— 执行位置迁出到同步域水位表, 然后删列(无包袱直迁)。
        // 先搬后删; 新库无 synced_id 列时两条语句报错被忽略(幂等)。
        let _ = sqlx::query(
            r#"INSERT OR IGNORE INTO session_sync_state (session_uuid, synced_id, hist_floor, backfill, updated_at)
               SELECT session_uuid, synced_id, NULL, 0, (CAST(strftime('%s','now') AS INTEGER) * 1000)
               FROM chat_session
               WHERE synced_id > 0 AND session_uuid IS NOT NULL"#,
        )
        .execute(pool_sqlite)
        .await; // 列不存在/已迁移, ignore
        let _ = sqlx::query("ALTER TABLE chat_session DROP COLUMN synced_id")
            .execute(pool_sqlite)
            .await; // Column already dropped, ignore
        let _ = sqlx::query(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_session_su ON chat_session(session_uuid)",
        )
        .execute(pool_sqlite)
        .await; // Index already exists, ignore
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
