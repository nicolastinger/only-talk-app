use crate::dao::{get_db_client, get_private_db_client};
use crate::entity::chat_record_read::ChatRecordRead;

/// 更新已读消息
pub async fn update_last_read_msg(chat_record_read: &ChatRecordRead) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let update_res = sqlx::query(r#"UPDATE chat_record_read SET nano_id = ?1, timestamp = ?2, send_user = ?3, recv_user = ?4 WHERE send_user = ?3 and recv_user = ?4"#)
        .bind(&chat_record_read.nano_id)
        .bind(chat_record_read.timestamp)
        .bind(&chat_record_read.send_user)
        .bind(&chat_record_read.recv_user)
        .execute(&pool_sqlite)
        .await;
    if update_res?.rows_affected() < 1 {
        sqlx::query(r#"INSERT INTO chat_record_read (nano_id, timestamp, send_user, recv_user) VALUES (?1, ?2, ?3, ?4)"#)
            .bind(&chat_record_read.nano_id)
            .bind(chat_record_read.timestamp)
            .bind(&chat_record_read.send_user)
            .bind(&chat_record_read.recv_user)
            .execute(&pool_sqlite)
            .await?;
    }
    Ok(())
}

/// 读取单聊对端当前的已读水位行(无则 None)。跨端已读回填时用于判断是否需要推进。
pub async fn query_read_watermark(
    me: &str,
    peer: &str,
) -> Result<Option<ChatRecordRead>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let record = sqlx::query_as::<_, ChatRecordRead>(
        r#"SELECT * FROM chat_record_read WHERE recv_user = ?1 AND send_user = ?2"#,
    )
    .bind(me)
    .bind(peer)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}

/// 跨端已读上报: 已读水位 nano_id 对应的服务端 id(水位即已读位置, 而非本地 max)。
///
/// 单聊水位表在主库、消息表在私库, 分两步查(不能跨库 JOIN)。
pub async fn read_watermark_server_id(me: &str, peer: &str) -> Result<Option<i64>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT nano_id FROM chat_record_read WHERE recv_user = ?1 AND send_user = ?2"#,
    )
    .bind(me)
    .bind(peer)
    .fetch_optional(&pool_sqlite)
    .await?;
    let Some((nano_id,)) = row else { return Ok(None) };
    let pool_private = get_private_db_client().await?;
    let row: Option<(i64,)> = sqlx::query_as(
        r#"SELECT server_id FROM chat_record WHERE nano_id = ?1 AND server_id IS NOT NULL"#,
    )
    .bind(nano_id)
    .fetch_optional(&pool_private)
    .await?;
    Ok(row.map(|r| r.0))
}
