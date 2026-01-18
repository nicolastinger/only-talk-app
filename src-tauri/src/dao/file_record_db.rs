use chrono::Local;
use log::info;

// 将文件记录插入数据库
pub async fn insert_file_record(
    biz_id: &str,
    uuid: &str,
    file_name: &str,
    file_path: &str,
    file_size: i64,
    mime_type: &str,
    file_hash: &str,
) -> Result<(), anyhow::Error> {
    use crate::dao::get_common_db_client;
    use sqlx::query;

    let pool = get_common_db_client().await?;
    let now = Local::now().timestamp();

    query("INSERT INTO file_record (biz_id, uuid, file_name, file_path, file_size, mime_type, file_hash, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(biz_id)
        .bind(uuid)
        .bind(file_name)
        .bind(file_path)
        .bind(file_size)
        .bind(mime_type)
        .bind(file_hash)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await?;

    info!("文件记录已插入数据库: {}", file_name);
    Ok(())
}