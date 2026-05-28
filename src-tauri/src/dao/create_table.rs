use sqlx::SqlitePool;

use crate::dao::store::init_sqlite;
use crate::entity::chat_record::ChatRecord;
use crate::entity::chat_record_ack::ChatRecordAck;
use crate::entity::chat_record_read::ChatRecordRead;
use crate::entity::chat_record_send::ChatRecordSend;
use crate::entity::chat_session::ChatSession;
use crate::entity::file_record::FileRecord;
use crate::entity::friend::Friend;
use crate::entity::group::Group;
use crate::entity::group_chat_record::GroupChatRecord;
use crate::entity::group_member::GroupMember;
use crate::entity::group_message_ack::GroupMessageAck;
use crate::entity::group_message_read::GroupMessageRead;
use crate::entity::system_notification::SystemNotification;
use crate::entity::user_info::UserInfo;
use crate::entity::user_token::UserToken;
use crate::GLOBAL_QUIC_USER_INFO;

/// 初始化公共数据库
pub async fn init_common_ddl(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    init_sqlite::<FileRecord>(pool_sqlite).await?;
    init_sqlite::<UserInfo>(pool_sqlite).await?;
    init_sqlite::<UserToken>(pool_sqlite).await?;
    {
        // 本地存储初始化成功
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("common_store_init".to_string(), "1".to_string());
    }
    Ok(())
}

/// 初始化数据库
pub async fn init_user_ddl(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    init_sqlite::<ChatRecordRead>(pool_sqlite).await?;
    init_sqlite::<ChatSession>(pool_sqlite).await?;
    init_sqlite::<Friend>(pool_sqlite).await?;
    init_sqlite::<Group>(pool_sqlite).await?;
    init_sqlite::<GroupMember>(pool_sqlite).await?;
    init_sqlite::<SystemNotification>(pool_sqlite).await?;

    init_sqlite::<ChatRecord>(pool_sqlite).await?;
    init_sqlite::<GroupChatRecord>(pool_sqlite).await?;
    init_sqlite::<ChatRecordSend>(pool_sqlite).await?;
    init_sqlite::<ChatRecordAck>(pool_sqlite).await?;
    init_sqlite::<GroupMessageAck>(pool_sqlite).await?;
    init_sqlite::<GroupMessageRead>(pool_sqlite).await?;
    {
        // 本地存储初始化成功
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("store_init".to_string(), "1".to_string());
    }
    Ok(())
}

/// 初始化加密数据库
pub async fn init_private_ddl(pool_sqlite: &SqlitePool) -> Result<(), anyhow::Error> {
    init_sqlite::<ChatRecord>(pool_sqlite).await?;
    init_sqlite::<GroupChatRecord>(pool_sqlite).await?;
    init_sqlite::<ChatRecordSend>(pool_sqlite).await?;
    init_sqlite::<ChatRecordAck>(pool_sqlite).await?;
    init_sqlite::<GroupMessageAck>(pool_sqlite).await?;
    init_sqlite::<GroupMessageRead>(pool_sqlite).await?;
    {
        // 本地存储初始化成功
        let mut guard = GLOBAL_QUIC_USER_INFO.write().await;
        guard.insert("private_store_init".to_string(), "1".to_string());
    }
    Ok(())
}
