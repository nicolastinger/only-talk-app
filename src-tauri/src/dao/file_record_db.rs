use chrono::Local;
use log::info;
use crate::dao::get_common_db_client;
use sqlx::query;

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

// 删除文件记录
pub async fn delete_file_record_by_id(biz_id: &str, uuid: &str) -> Result<(), anyhow::Error> {
    let pool = get_common_db_client().await?;
    query("DELETE FROM file_record WHERE biz_id = ? and uuid = ?")
        .bind(biz_id)
        .bind(uuid)
        .execute(&pool)
        .await?;
    info!("文件记录已删除: {}", biz_id);
    Ok(())
}