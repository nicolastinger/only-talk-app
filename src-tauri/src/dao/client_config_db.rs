use crate::dao::get_common_db_client;
use crate::entity::client_config::ClientConfig;
use crate::utils::time::get_now_time_stamp_as_millis;

fn now_ms() -> Result<i64, anyhow::Error> {
    Ok(get_now_time_stamp_as_millis()?)
}

/// 读取单个配置项(不存在返回 None)。
pub async fn get_config(key: &str) -> Result<Option<String>, anyhow::Error> {
    let pool = get_common_db_client().await?;
    let value: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM client_config WHERE config_key = ?1",
    )
    .bind(key)
    .fetch_optional(&pool)
    .await?;
    Ok(value)
}

/// 写入/更新单个配置项(upsert)。
pub async fn set_config(key: &str, value: &str) -> Result<(), anyhow::Error> {
    let pool = get_common_db_client().await?;
    sqlx::query(
        r#"INSERT INTO client_config (config_key, config_value, updated_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(config_key) DO UPDATE SET
               config_value = excluded.config_value,
               updated_at   = excluded.updated_at"#,
    )
    .bind(key)
    .bind(value)
    .bind(now_ms()?)
    .execute(&pool)
    .await?;
    Ok(())
}

/// 删除单个配置项。
pub async fn delete_config(key: &str) -> Result<(), anyhow::Error> {
    let pool = get_common_db_client().await?;
    sqlx::query("DELETE FROM client_config WHERE config_key = ?1")
        .bind(key)
        .execute(&pool)
        .await?;
    Ok(())
}

/// 读取全部配置项。
pub async fn get_all_configs() -> Result<Vec<ClientConfig>, anyhow::Error> {
    let pool = get_common_db_client().await?;
    let rows = sqlx::query_as::<_, ClientConfig>(
        "SELECT * FROM client_config ORDER BY config_key",
    )
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}