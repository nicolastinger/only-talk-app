use crate::dao::get_db_client;
use crate::models::entity::chat_background::ChatBackground;
use crate::utils::time::get_now_time_stamp_as_millis;

/// 新增背景记录并立即置为生效(其余记录改为历史)。
/// 返回新记录 id。
pub async fn insert_and_activate(file_name: &str) -> Result<i64, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let now = get_now_time_stamp_as_millis()?;
    let mut tx = pool_sqlite.begin().await?;
    sqlx::query("UPDATE chat_background SET is_active = 0").execute(&mut *tx).await?;
    let id = sqlx::query(
        "INSERT INTO chat_background (file_name, is_active, created_at) VALUES (?1, 1, ?2)",
    )
    .bind(file_name)
    .bind(now)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;
    Ok(id)
}

/// 全部背景记录(新→旧), 含历史。
pub async fn list() -> Result<Vec<ChatBackground>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let rows = sqlx::query_as::<_, ChatBackground>(
        "SELECT * FROM chat_background ORDER BY created_at DESC, id DESC",
    )
    .fetch_all(&pool_sqlite)
    .await?;
    Ok(rows)
}

/// 按 id 查询单条记录。
pub async fn get(id: i64) -> Result<Option<ChatBackground>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let row = sqlx::query_as::<_, ChatBackground>("SELECT * FROM chat_background WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool_sqlite)
        .await?;
    Ok(row)
}

/// 切换生效背景; `id <= 0` 表示恢复默认(清空生效标记, 保留历史)。
/// 返回是否成功命中记录(恢复默认恒为 true)。
pub async fn set_active(id: i64) -> Result<bool, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let mut tx = pool_sqlite.begin().await?;
    sqlx::query("UPDATE chat_background SET is_active = 0").execute(&mut *tx).await?;
    let affected = if id > 0 {
        sqlx::query("UPDATE chat_background SET is_active = 1 WHERE id = ?1")
            .bind(id)
            .execute(&mut *tx)
            .await?
            .rows_affected()
    } else {
        0
    };
    tx.commit().await?;
    Ok(id <= 0 || affected > 0)
}

/// 删除一条背景记录, 返回被删除的文件名(供上层删除磁盘文件)。
pub async fn delete(id: i64) -> Result<Option<String>, anyhow::Error> {
    let pool_sqlite = get_db_client().await?;
    let file_name: Option<String> =
        sqlx::query_scalar("SELECT file_name FROM chat_background WHERE id = ?1")
            .bind(id)
            .fetch_optional(&pool_sqlite)
            .await?;
    if file_name.is_some() {
        sqlx::query("DELETE FROM chat_background WHERE id = ?1")
            .bind(id)
            .execute(&pool_sqlite)
            .await?;
    }
    Ok(file_name)
}
