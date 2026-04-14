use anyhow::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::dao::get_common_db_client;
use crate::dao::store::SqliteStore;

/// 用户信息缓存表结构
/// 对应后端 UserInfoVO，用于前端本地缓存用户信息
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct UserInfo {
    /// 自增主键
    #[serde(default)]
    pub id: i64,
    /// 用户唯一标识符 (UUID)
    pub uuid: String,
    /// 用户名
    pub username: Option<String>,
    /// 用户账号
    pub account: Option<String>,
    /// 头像的业务 ID
    pub icon: Option<String>,
    /// 用户性别 (0: 未知, 1: 保密, 2: 男, 3: 女, 4: 机器人, 5: 其他)
    pub gender: Option<u8>,
    /// 用户年龄
    pub age: Option<u8>,
    /// 用户生日 (Unix 时间戳，单位：秒)
    pub birthday: Option<i64>,
    /// 用户简介
    pub info: Option<String>,
    /// 用户手机号码
    pub phone: Option<String>,
    /// 用户电子邮箱
    pub email: Option<String>,
    /// 用户地址信息
    pub address: Option<String>,
    /// 用户状态 (0: 正常, 1: 禁用, 2: 注销等)
    pub status: Option<u8>,
    /// 创建时间 (Unix 时间戳，单位：秒)
    #[serde(default)]
    pub created_at: i64,
    /// 更新时间 (Unix 时间戳，单位：秒)
    #[serde(default)]
    pub updated_at: i64,
}

impl SqliteStore for UserInfo {
    async fn create_table(pool_sqlite: &SqlitePool) -> Result<(), Error> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS user_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            username TEXT,
            account TEXT,
            icon TEXT,
            gender INTEGER,
            age INTEGER,
            birthday INTEGER,
            info TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            status INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
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

impl UserInfo {
    /// 新增用户信息
    pub async fn insert(&self) -> Result<i64, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let now =
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                as i64;

        let result = sqlx::query(
            r#"INSERT INTO user_info 
            (uuid, username, account, icon, gender, age, birthday, info, phone, email, address, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"#
        )
        .bind(&self.uuid)
        .bind(&self.username)
        .bind(&self.account)
        .bind(&self.icon)
        .bind(self.gender)
        .bind(self.age)
        .bind(self.birthday)
        .bind(&self.info)
        .bind(&self.phone)
        .bind(&self.email)
        .bind(&self.address)
        .bind(self.status)
        .bind(now)
        .bind(now)
        .execute(&pool_sqlite)
        .await?;

        Ok(result.last_insert_rowid())
    }

    /// 根据 UUID 查询用户信息
    pub async fn query_by_uuid(uuid: &str) -> Result<Option<UserInfo>, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let user = sqlx::query_as::<_, UserInfo>(r#"SELECT * FROM user_info WHERE uuid = ?1"#)
            .bind(uuid)
            .fetch_optional(&pool_sqlite)
            .await?;
        Ok(user)
    }

    /// 根据账号查询用户信息
    pub async fn query_by_account(account: &str) -> Result<Option<UserInfo>, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let user = sqlx::query_as::<_, UserInfo>(r#"SELECT * FROM user_info WHERE account = ?1"#)
            .bind(account)
            .fetch_optional(&pool_sqlite)
            .await?;
        Ok(user)
    }

    /// 查询所有用户信息
    pub async fn query_all() -> Result<Vec<UserInfo>, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let users =
            sqlx::query_as::<_, UserInfo>(r#"SELECT * FROM user_info ORDER BY updated_at DESC"#)
                .fetch_all(&pool_sqlite)
                .await?;
        Ok(users)
    }

    /// 更新用户信息（根据 UUID）
    pub async fn update_by_uuid(&self) -> Result<u64, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let now =
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                as i64;

        let result = sqlx::query(
            r#"UPDATE user_info SET 
            username = ?1, account = ?2, icon = ?3, gender = ?4, age = ?5, 
            birthday = ?6, info = ?7, phone = ?8, email = ?9, address = ?10, 
            status = ?11, updated_at = ?12
            WHERE uuid = ?13"#,
        )
        .bind(&self.username)
        .bind(&self.account)
        .bind(&self.icon)
        .bind(self.gender)
        .bind(self.age)
        .bind(self.birthday)
        .bind(&self.info)
        .bind(&self.phone)
        .bind(&self.email)
        .bind(&self.address)
        .bind(self.status)
        .bind(now)
        .bind(&self.uuid)
        .execute(&pool_sqlite)
        .await?;

        Ok(result.rows_affected())
    }

    /// 根据 UUID 删除用户信息
    pub async fn delete_by_uuid(uuid: &str) -> Result<u64, anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let result = sqlx::query(r#"DELETE FROM user_info WHERE uuid = ?1"#)
            .bind(uuid)
            .execute(&pool_sqlite)
            .await?;
        Ok(result.rows_affected())
    }

    /// 批量插入或更新用户信息（UPSERT）
    pub async fn upsert(&self) -> Result<(), anyhow::Error> {
        let pool_sqlite = get_common_db_client().await?;
        let now =
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                as i64;

        sqlx::query(
            r#"INSERT INTO user_info 
            (uuid, username, account, icon, gender, age, birthday, info, phone, email, address, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(uuid) DO UPDATE SET
            username = excluded.username,
            account = excluded.account,
            icon = excluded.icon,
            gender = excluded.gender,
            age = excluded.age,
            birthday = excluded.birthday,
            info = excluded.info,
            phone = excluded.phone,
            email = excluded.email,
            address = excluded.address,
            status = excluded.status,
            updated_at = excluded.updated_at"#
        )
        .bind(&self.uuid)
        .bind(&self.username)
        .bind(&self.account)
        .bind(&self.icon)
        .bind(self.gender)
        .bind(self.age)
        .bind(self.birthday)
        .bind(&self.info)
        .bind(&self.phone)
        .bind(&self.email)
        .bind(&self.address)
        .bind(self.status)
        .bind(now)
        .bind(now)
        .execute(&pool_sqlite)
        .await?;

        Ok(())
    }
}
