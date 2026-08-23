use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::store::SqliteStore;

/// WebRTC 信令明细（一个会话内的 offer/answer/candidate/end 等步骤）
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct WebrtcSignal {
    pub id: i64,
    pub nano_id: String,
    pub session_id: String,
    pub msg_type: String,
    pub send_user: String,
    pub recv_user: String,
    pub data: String,
    pub timestamp: i64,
}

impl SqliteStore for WebrtcSignal {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS webrtc_signal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nano_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            msg_type TEXT NOT NULL,
            send_user TEXT NOT NULL,
            recv_user TEXT NOT NULL,
            data TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )"#,
        )
        .execute(pool_sqlite)
        .await?;
        Ok(())
    }

    async fn update_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }

    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), Error> {
        Ok(())
    }
}
