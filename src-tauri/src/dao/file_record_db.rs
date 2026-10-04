use log::info;
use sqlx::query;

use crate::dao::get_common_db_client;
use crate::entity::file_record::FileRecord;
use crate::utils::time::get_now_time_stamp_as_millis;

// 最大下载重试次数
pub const MAX_DOWNLOAD_RETRY_COUNT: i32 = 5;

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
    let now = get_now_time_stamp_as_millis().unwrap_or(0);

    query("INSERT INTO file_record (biz_id, uuid, file_name, file_path, file_size, mime_type, file_hash, status, download_retry_count, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)")
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

/// 查询全部本地文件记录（仅正常状态，供文件管理列表展示）
pub async fn list_all_files() -> Result<Vec<FileRecord>, anyhow::Error> {
    let pool = get_common_db_client().await?;
    let rows = sqlx::query_as::<_, FileRecord>(
        "SELECT * FROM file_record WHERE status = 0 ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

/// 按主键查询文件记录
pub async fn query_file_record_by_id(id: i64) -> Result<Option<FileRecord>, anyhow::Error> {
    let pool = get_common_db_client().await?;
    let row = sqlx::query_as::<_, FileRecord>("SELECT * FROM file_record WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await?;
    Ok(row)
}

/// 按主键删除文件记录
pub async fn delete_file_record_by_pk(id: i64) -> Result<(), anyhow::Error> {
    let pool = get_common_db_client().await?;
    query("DELETE FROM file_record WHERE id = ?1").bind(id).execute(&pool).await?;
    Ok(())
}

/// 更新下载失败重试次数
/// 递增 download_retry_count，如果超过最大重试次数则将 status 设为 3（下载失败超过重试上限）
/// 返回更新后的重试次数
pub async fn increment_download_retry_count(
    biz_id: &str,
    uuid: &str,
) -> Result<i32, anyhow::Error> {
    let pool = get_common_db_client().await?;
    let now = get_now_time_stamp_as_millis().unwrap_or(0);

    // 先查询当前重试次数
    let current_count: Option<i32> = sqlx::query_scalar(
        r#"SELECT download_retry_count FROM file_record WHERE biz_id = ? AND uuid = ?"#,
    )
    .bind(biz_id)
    .bind(uuid)
    .fetch_optional(&pool)
    .await?
    .flatten();

    let new_count = current_count.unwrap_or(0) + 1;

    if new_count >= MAX_DOWNLOAD_RETRY_COUNT {
        // 超过最大重试次数，将状态设为3
        query(
            r#"UPDATE file_record SET download_retry_count = ?, status = 3, updated_at = ? WHERE biz_id = ? AND uuid = ?"#,
        )
        .bind(new_count)
        .bind(now)
        .bind(biz_id)
        .bind(uuid)
        .execute(&pool)
        .await?;
        info!(
            "文件下载失败重试次数已达上限({}次)，不再重试: biz_id={}, uuid={}",
            MAX_DOWNLOAD_RETRY_COUNT, biz_id, uuid
        );
    } else {
        // 未超过上限，仅递增重试次数
        query(
            r#"UPDATE file_record SET download_retry_count = ?, updated_at = ? WHERE biz_id = ? AND uuid = ?"#,
        )
        .bind(new_count)
        .bind(now)
        .bind(biz_id)
        .bind(uuid)
        .execute(&pool)
        .await?;
        info!(
            "文件下载失败重试次数递增: biz_id={}, uuid={}, 当前次数={}/{}",
            biz_id, uuid, new_count, MAX_DOWNLOAD_RETRY_COUNT
        );
    }

    Ok(new_count)
}

/// 插入一条下载失败的文件记录（仅用于追踪重试次数）
pub async fn insert_failed_file_record(
    biz_id: &str,
    uuid: &str,
    created_at: i64,
) -> Result<(), anyhow::Error> {
    let pool = get_common_db_client().await?;
    let now = get_now_time_stamp_as_millis().unwrap_or(0);

    query(
        r#"INSERT INTO file_record (biz_id, uuid, file_name, file_path, file_size, mime_type, file_hash, status, download_retry_count, created_at, updated_at) 
           VALUES (?, ?, '', '', 0, '', '', 3, 0, ?, ?)"#,
    )
    .bind(biz_id)
    .bind(uuid)
    .bind(created_at)
    .bind(now)
    .execute(&pool)
    .await?;

    info!("插入下载失败文件记录: biz_id={}, uuid={}", biz_id, uuid);
    Ok(())
}
