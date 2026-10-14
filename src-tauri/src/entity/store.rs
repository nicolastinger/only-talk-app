use sqlx::SqlitePool;

/// 表生命周期契约: entity(充血模型)自行声明建表/迁移/删除 DDL。
/// 由 `dao` 的建表流程通过 [`init_sqlite`] 调用。
#[allow(async_fn_in_trait)]
pub trait SqliteStore {
    // 创建表结构
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
    // 更新表结构
    async fn update_table(_pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
    // 删除表结构
    async fn drop_table(_pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
}

pub async fn init_sqlite<T>(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>
where
    T: SqliteStore,
{
    T::create_table(pool_sqlite).await?;
    T::update_table(pool_sqlite).await?;
    T::drop_table(pool_sqlite).await?;
    Ok(())
}
