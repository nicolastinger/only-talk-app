use sqlx::SqlitePool;

pub trait SqliteStore {
    // 创建表结构
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
    // 更新表结构
    async fn update_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
    // 删除表结构
    async fn drop_table(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error>;
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
