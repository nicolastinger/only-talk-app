use crate::dao::get_private_db_client;
use crate::entity::group_message_read::GroupMessageRead;

pub async fn update_group_message_read(record: &GroupMessageRead) -> Result<(), anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let update_res = sqlx::query(
        r#"UPDATE group_message_read SET nano_id = ?1, timestamp = ?2 WHERE group_uuid = ?3 AND user_uuid = ?4"#,
    )
    .bind(&record.nano_id)
    .bind(record.timestamp)
    .bind(&record.group_uuid)
    .bind(&record.user_uuid)
    .execute(&pool_sqlite)
    .await;

    if update_res?.rows_affected() < 1 {
        sqlx::query(
            r#"INSERT INTO group_message_read (nano_id, timestamp, group_uuid, user_uuid) VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(&record.nano_id)
        .bind(record.timestamp)
        .bind(&record.group_uuid)
        .bind(&record.user_uuid)
        .execute(&pool_sqlite)
        .await?;
    }
    Ok(())
}

pub async fn query_group_message_read(
    group_uuid: &str,
    user_uuid: &str,
) -> Result<Option<GroupMessageRead>, anyhow::Error> {
    let pool_sqlite = get_private_db_client().await?;
    let record = sqlx::query_as::<_, GroupMessageRead>(
        r#"SELECT * FROM group_message_read WHERE group_uuid = ?1 AND user_uuid = ?2"#,
    )
    .bind(group_uuid)
    .bind(user_uuid)
    .fetch_optional(&pool_sqlite)
    .await?;
    Ok(record)
}
