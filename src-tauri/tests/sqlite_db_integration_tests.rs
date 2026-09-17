#![cfg(test)]

//! sqlite 存储层集成测试。
//!
//! 通过 tests/common 脚手架在系统临时目录创建临时 sqlite 文件(含加密 private 库),
//! 测试完毕后自动删除临时文件。

mod common;

use app_lib::dao::app_log_db::{
    clear_app_logs, delete_app_log_by_id, insert_app_log, query_app_log_by_id,
    query_app_logs_paged, update_app_log,
};
use app_lib::dao::chat_record_ack::{
    insert_chat_record_ack, query_ack_record_from_db, query_chat_record_by_send_id,
    update_chat_record_ack, update_chat_record_ack_prev_id,
};
use app_lib::dao::chat_record_db::{
    insert_chat_record, query_chat_record_by_id_from_db, query_chat_record_by_type_from_db,
    query_chat_record_from_db, query_last_chat_record, query_last_read_msg,
};
use app_lib::dao::chat_record_send::{
    insert_chat_record_send, query_chat_record_send_by_user, query_record_send_from_db,
    update_chat_record_send, update_chat_record_send_status, update_chat_record_send_success,
};
use app_lib::dao::create_table::init_user_ddl;
use app_lib::dao::client_config_db::{delete_config, get_all_configs, get_config, set_config};
use app_lib::dao::file_record_db::{
    delete_file_record_by_id, increment_download_retry_count, insert_failed_file_record,
    insert_file_record, MAX_DOWNLOAD_RETRY_COUNT,
};
use app_lib::dao::friend_db::{
    is_blocked_db, query_black_list_db, query_friend_info_by_id_db, query_friend_info_db,
    search_friend_db, set_block_friend_db, soft_delete_friend_db, update_friend_info_db,
    update_friend_profile_db,
};
use app_lib::dao::get_db_client;
use app_lib::dao::group_chat_record_db::{
    insert_group_chat_record, query_group_chat_record_from_db, query_last_group_chat_record,
};
use app_lib::dao::group_message_ack::{
    insert_group_message_ack, query_group_message_ack_by_local_nano_id,
    query_group_message_ack_by_nano_id, query_pending_group_message_acks,
    update_group_message_ack_status,
};
use app_lib::dao::group_message_read::{
    query_group_last_read_msg, query_group_message_read, update_group_message_read,
};
use app_lib::dao::session_db::{
    hide_chat_session_db, query_chat_session_by_user_db, query_chat_session_db,
    search_chat_session_db, show_chat_session_db, update_chat_session_db,
};
use app_lib::dao::session_sync_state_db::{
    complete_backfill, get_hist_floor, get_state, list_gap_sessions, set_backfill_status,
    upsert_pull_position,
};
use app_lib::dao::sync_task_db::{
    claim_pending, enqueue, has_pending, history, list_batch_tasks, mark_failed, mark_success,
    prune_batches, record_batch, reset_running,
};
use app_lib::dao::webrtc_signal_db::{
    insert_webrtc_signal, query_webrtc_signal_by_session, save_webrtc_signal,
};
use app_lib::entity::app_log::LOG_LEVEL_INFO;
use app_lib::entity::chat_record::ChatRecord;
use app_lib::entity::chat_record_ack::ChatRecordAck;
use app_lib::entity::chat_record_send::ChatRecordSend;
use app_lib::entity::chat_session::ChatSession;
use app_lib::entity::file_record::FileRecord;
use app_lib::entity::friend::Friend;
use app_lib::entity::group::Group;
use app_lib::entity::group_chat_record::GroupChatRecord;
use app_lib::entity::group_member::GroupMember;
use app_lib::entity::group_message_ack::GroupMessageAck;
use app_lib::entity::group_message_read::GroupMessageRead;
use app_lib::entity::session_sync_state::{BACKFILL_DONE, BACKFILL_NONE};
use app_lib::entity::sync_task::{
    SYNC_KIND_BACKFILL, SYNC_KIND_GAP, SYNC_STATUS_FAILED, SYNC_STATUS_RUNNING,
};
use app_lib::entity::system_notification::SystemNotification;
use app_lib::entity::user_info::UserInfo;
use app_lib::entity::user_token::UserToken;
use app_lib::service::user_service::insert_user_info;
use app_lib::utils::message_types::MSG_TYPE_WEBRTC_SIGNAL;
use app_lib::vo::text_quic_msg::TextQuicMsgVo;

use common::{with_common_db, with_private_db, with_user_db};
use sqlx::Row;

const ME: &str = "00000000-0000-0000-0000-000000000001";
const FRIEND: &str = "00000000-0000-0000-0000-000000000002";

// ---------- user.db (明文) ----------

#[tokio::test]
async fn friend_db_upsert_query_block_soft_delete_roundtrip() {
    with_user_db(|_pool| async move {
        let friend = Friend {
            id: 0,
            created_at: 1000,
            updated_at: 1000,
            friend_id: FRIEND.to_string(),
            friend_account: "alice".to_string(),
            friend_name: "Alice".to_string(),
            friend_icon: "http://icon/alice.png".to_string(),
            friend_info: "{}".to_string(),
            friend_user_type: None,
            friend_status: 0,
            me: ME.to_string(),
            is_del: false,
            is_block: 0,
            is_mute: 0,
            is_top: 0,
            is_show: 1,
            version: 0,
        };

        // 首次调用走 INSERT 分支
        update_friend_info_db(&friend).await.expect("插入好友失败");

        let list = query_friend_info_db(ME).await.expect("查询好友列表失败");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].friend_name, "Alice");

        let one = query_friend_info_by_id_db(ME, FRIEND).await.expect("按id查询好友失败");
        assert_eq!(one.friend_account, "alice");

        // 定向更新资料字段
        update_friend_profile_db(
            ME,
            FRIEND,
            "alice",
            "AliceChanged",
            "http://icon/new.png",
            "{\"nick\":\"AC\"}",
        )
        .await
        .expect("更新好友资料失败");
        let one = query_friend_info_by_id_db(ME, FRIEND).await.expect("按id查询好友失败");
        assert_eq!(one.friend_name, "AliceChanged");

        // 模糊搜索(名称/账号)
        let hits = search_friend_db(ME, "Alice").await.expect("搜索好友失败");
        assert_eq!(hits.len(), 1);
        let no_hits = search_friend_db(ME, "不存在").await.expect("搜索好友失败");
        assert!(no_hits.is_empty());

        // 拉黑
        set_block_friend_db(ME, FRIEND, 1).await.expect("拉黑好友失败");
        assert!(is_blocked_db(ME, FRIEND).await.expect("查询拉黑状态失败"));
        let black = query_black_list_db(ME).await.expect("查询黑名单失败");
        assert_eq!(black.len(), 1);
        assert_eq!(black[0].friend_id, FRIEND);

        // 取消拉黑
        set_block_friend_db(ME, FRIEND, 0).await.expect("取消拉黑失败");
        assert!(!is_blocked_db(ME, FRIEND).await.expect("查询拉黑状态失败"));

        // 软删除
        soft_delete_friend_db(ME, FRIEND).await.expect("软删除好友失败");
        let list = query_friend_info_db(ME).await.expect("查询好友列表失败");
        assert!(list.is_empty(), "软删除后列表应过滤 is_del=1");
        assert!(!is_blocked_db(ME, FRIEND).await.expect("查询拉黑状态失败"));
    })
    .await;
}

#[tokio::test]
async fn session_db_upsert_canonical_hide_search_roundtrip() {
    with_user_db(|_pool| async move {
        insert_user_info("uuid", ME).await.expect("写入用户信息失败");

        let session = ChatSession {
            id: 0,
            nano_id: "nano-1".to_string(),
            timestamp: 100,
            text_type: 0,
            unread_count: 1,
            last_message: "hello".to_string(),
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(), // send==me, 应归一化为 send=friend, recv=me
            session_type: 1,
            is_show: 1,
            is_top: 0,
            group_id: None,
            session_uuid: None,
            last_message_id: 0,
        };

        // 首次调用 -> 无匹配行走 INSERT 分支
        update_chat_session_db(&session).await.expect("更新会话失败");

        let rows = query_chat_session_by_user_db(ME, FRIEND).await.expect("查询会话失败");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].send_user, FRIEND, "send_user 应归一化为对方");
        assert_eq!(rows[0].recv_user, ME);
        assert_eq!(rows[0].last_message, "hello");
        assert_eq!(rows[0].unread_count, 1);

        // 再次调用 -> 走 UPDATE 分支, unread_count 累加
        let session2 = ChatSession {
            id: 0,
            nano_id: "nano-2".to_string(),
            timestamp: 200,
            text_type: 0,
            unread_count: 2,
            last_message: "world".to_string(),
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            session_type: 1,
            is_show: 1,
            is_top: 0,
            group_id: None,
            session_uuid: None,
            last_message_id: 0,
        };
        update_chat_session_db(&session2).await.expect("更新会话失败");

        let rows = query_chat_session_by_user_db(ME, FRIEND).await.expect("查询会话失败");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].unread_count, 3, "UPDATE 分支应累加 unread_count");
        assert_eq!(rows[0].last_message, "world");
        assert_eq!(rows[0].timestamp, 200);

        // 会话列表(无好友数据, friend_name 为空串)
        let list = query_chat_session_db(ME).await.expect("查询会话列表失败");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].last_message, "world");
        assert_eq!(list[0].friend_name, "");

        // 隐藏/显示
        hide_chat_session_db(ME, FRIEND).await.expect("隐藏会话失败");
        let list = query_chat_session_db(ME).await.expect("查询会话列表失败");
        assert!(list.is_empty(), "隐藏后 is_show=1 过滤应剔除该会话");
        show_chat_session_db(ME, FRIEND).await.expect("显示会话失败");
        let list = query_chat_session_db(ME).await.expect("查询会话列表失败");
        assert_eq!(list.len(), 1);

        // 按 last_message 模糊搜索
        let hits = search_chat_session_db(ME, "world").await.expect("搜索会话失败");
        assert_eq!(hits.len(), 1);
        let no_hits = search_chat_session_db(ME, "zzz").await.expect("搜索会话失败");
        assert!(no_hits.is_empty());
    })
    .await;
}

#[tokio::test]
async fn chat_record_read_query_last_read_msg() {
    with_user_db(|pool| async move {
        for (i, (nano, ts)) in [("r1", 100i64), ("r2", 200i64), ("r3", 300i64)].iter().enumerate() {
            let sender = format!("00000000-0000-0000-0000-00000000001{}", i + 1);
            sqlx::query(
                "INSERT INTO chat_record_read (nano_id, timestamp, send_user, recv_user) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(*nano)
            .bind(*ts)
            .bind(&sender)
            .bind(ME)
            .execute(&pool)
            .await
            .expect("插入已读记录失败");
        }

        let after = query_last_read_msg(ME, 100).await.expect("查询已读失败");
        assert_eq!(after.len(), 2);
        assert!(after.iter().all(|r| r.timestamp > 100));
        assert!(after.iter().all(|r| r.recv_user == ME));

        let all = query_last_read_msg(ME, 0).await.expect("查询已读失败");
        assert_eq!(all.len(), 3);
    })
    .await;
}

#[tokio::test]
async fn app_log_db_insert_query_update_delete() {
    with_user_db(|_pool| async move {
        let id = insert_app_log("QUIC", LOG_LEVEL_INFO, "test", "raw-msg", "127.0.0.1", "detail")
            .await
            .expect("插入日志失败");
        assert!(id > 0);

        let log = query_app_log_by_id(id).await.expect("查询日志失败").expect("日志不存在");
        assert_eq!(log.raw, "raw-msg");

        let (list, total) = query_app_logs_paged(Some("QUIC"), Some(LOG_LEVEL_INFO), 1, 10)
            .await
            .expect("分页查询失败");
        assert!(total >= 1);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].source, "test");

        assert!(update_app_log(id, "raw-2", "detail-2").await.expect("更新日志失败"));
        let log = query_app_log_by_id(id).await.expect("查询日志失败").expect("日志不存在");
        assert_eq!(log.raw, "raw-2");

        assert!(delete_app_log_by_id(id).await.expect("删除日志失败"));
        assert!(query_app_log_by_id(id).await.expect("查询日志失败").is_none());

        let id2 = insert_app_log("QUIC", LOG_LEVEL_INFO, "test", "b", "", "")
            .await
            .expect("插入日志失败");
        assert_eq!(clear_app_logs().await.expect("清空日志失败"), 1);
        assert!(query_app_log_by_id(id2).await.expect("查询日志失败").is_none());
    })
    .await;
}

#[tokio::test]
async fn user_ddl_idempotent_reinit() {
    with_user_db(|_pool| async move {
        // 脚手架 setup 已 init 一次, 这里通过全局池再 init 一次验证幂等
        let pool = get_db_client().await.expect("获取全局池失败");
        init_user_ddl(&pool).await.expect("重复初始化 user 表结构失败");
    })
    .await;
}

// ---------- common.db (明文) ----------

#[tokio::test]
async fn file_record_db_insert_retry_limit_delete() {
    with_common_db(|_pool| async move {
        let biz = "biz-001";
        insert_file_record(biz, ME, "photo.jpg", "C:/tmp/photo.jpg", 2048, "image/jpeg", "abc123")
            .await
            .expect("插入文件记录失败");

        let records = FileRecord::get_by_biz_id(biz).await.expect("按biz_id查询失败");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].file_name.as_deref(), Some("photo.jpg"));
        assert_eq!(records[0].file_size, Some(2048));

        // 重试计数递增到上限后 status 置 3
        let mut count = 0;
        for _ in 0..MAX_DOWNLOAD_RETRY_COUNT {
            count = increment_download_retry_count(biz, ME).await.expect("递增重试失败");
        }
        assert_eq!(count, MAX_DOWNLOAD_RETRY_COUNT);
        assert!(
            FileRecord::get_by_biz_id(biz).await.expect("查询失败").is_empty(),
            "status=3 的记录不应被正常查询返回"
        );
        assert_eq!(FileRecord::get_by_biz_id_include_failed(biz).await.expect("查询失败").len(), 1);

        // 下载失败记录(直接 status=3)
        insert_failed_file_record("biz-002", ME, 1000).await.expect("插入失败记录失败");
        assert!(FileRecord::get_by_biz_id("biz-002").await.expect("查询失败").is_empty());
        assert_eq!(
            FileRecord::get_by_biz_id_include_failed("biz-002").await.expect("查询失败").len(),
            1
        );

        // 删除
        delete_file_record_by_id(biz, ME).await.expect("删除文件记录失败");
        assert!(
            FileRecord::get_by_biz_id_include_failed(biz).await.expect("查询失败").is_empty(),
            "删除后不应再查到"
        );
    })
    .await;
}

/// 客户端配置表(client_config): upsert / 读取 / 删除
#[tokio::test]
async fn client_config_crud() {
    with_common_db(|_pool| async move {
        assert!(get_config("app.theme").await.expect("查询失败").is_none());

        set_config("app.theme", "dark").await.expect("写入失败");
        assert_eq!(get_config("app.theme").await.expect("查询失败").as_deref(), Some("dark"));

        // upsert 覆盖
        set_config("app.theme", "light").await.expect("覆盖失败");
        assert_eq!(get_config("app.theme").await.expect("查询失败").as_deref(), Some("light"));

        set_config("server.api_base", "http://127.0.0.1:8443").await.expect("写入失败");
        let all = get_all_configs().await.expect("读取全部失败");
        assert_eq!(all.len(), 2);

        delete_config("app.theme").await.expect("删除失败");
        assert!(get_config("app.theme").await.expect("查询失败").is_none());
        assert_eq!(get_all_configs().await.expect("读取全部失败").len(), 1);
    })
    .await;
}

// ---------- private.db (SQLCipher 加密) ----------

#[tokio::test]
async fn chat_record_db_insert_dedup_query_paging_type_filter() {
    with_private_db(|_pool| async move {
        let msg1 = TextQuicMsgVo {
            nano_id: "m1".to_string(),
            text_type: 0,
            raw: "hi".to_string(),
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
        };
        assert!(insert_chat_record(&msg1).await.expect("插入消息失败"), "首次应真正新增");
        assert!(
            !insert_chat_record(&msg1).await.expect("插入消息失败"),
            "同 nano_id 应被 INSERT OR IGNORE 去重"
        );

        for (nano, ts, ty, raw) in [
            ("m2", 200i64, 0u16, "hello"),
            ("m3", 300i64, 1u16, "{\"x\":1}"),
            ("m4", 400i64, 0u16, "world"),
        ] {
            let msg = TextQuicMsgVo {
                nano_id: nano.to_string(),
                text_type: ty,
                raw: raw.to_string(),
                recv_user: FRIEND.to_string(),
                send_user: ME.to_string(),
                timestamp: ts,
            };
            assert!(insert_chat_record(&msg).await.expect("插入消息失败"));
        }

        // 反向方向(send/recv 互换)也计入双方会话
        let msg5 = TextQuicMsgVo {
            nano_id: "m5".to_string(),
            text_type: 0,
            raw: "reply".to_string(),
            recv_user: ME.to_string(),
            send_user: FRIEND.to_string(),
            timestamp: 500,
        };
        assert!(insert_chat_record(&msg5).await.expect("插入消息失败"));

        let count = ChatRecord::query_chat_record_count_by_friend(ME, FRIEND)
            .await
            .expect("统计聊天条数失败");
        assert_eq!(count, 5);

        // 分页: 内部取 timestamp desc limit, 外层升序 -> 页大小为2时返回 (400, 500)
        let page = query_chat_record_from_db(ME, FRIEND, 2, 0).await.expect("分页查询失败");
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].timestamp, 400);
        assert_eq!(page[1].timestamp, 500);

        // 类型过滤
        let typed =
            query_chat_record_by_type_from_db(ME, FRIEND, 1, 10, 0).await.expect("按类型过滤失败");
        assert_eq!(typed.len(), 1);
        assert_eq!(typed[0].nano_id, "m3");

        // 最新一条
        let last = query_last_chat_record(ME, FRIEND).await.expect("查询最新消息失败");
        assert_eq!(last.expect("应存在最新消息").nano_id, "m5");

        // 按 nano_id + 本人 uuid 查询
        let by_id = query_chat_record_by_id_from_db("m4", ME).await.expect("按id查询失败");
        assert_eq!(by_id.raw, "world");
    })
    .await;
}

#[tokio::test]
async fn chat_record_biz_id_file_info() {
    with_private_db(|_pool| async move {
        let raw =
            r#"{"biz_id":"biz-9","file_name":"report.pdf","file_type":"pdf","file_size":1024}"#;
        let msg = TextQuicMsgVo {
            nano_id: "file-1".to_string(),
            text_type: 3,
            raw: raw.to_string(),
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
        };
        insert_chat_record(&msg).await.expect("插入文件消息失败");

        let info = ChatRecord::get_file_info_by_biz_id("biz-9").await.expect("查询文件信息失败");
        assert_eq!(info, Some(("report.pdf".to_string(), "pdf".to_string())));

        let none =
            ChatRecord::get_file_info_by_biz_id("biz-missing").await.expect("查询文件信息失败");
        assert!(none.is_none());
    })
    .await;
}

#[tokio::test]
async fn group_chat_record_db_insert_dedup_query() {
    with_private_db(|_pool| async move {
        let group = "00000000-0000-0000-0000-0000000000gg";

        let rec1 = GroupChatRecord {
            id: 0,
            nano_id: "g1".to_string(),
            text_type: 0,
            raw: "group hi".to_string(),
            group_id: group.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
            server_id: None,
        };
        assert!(GroupChatRecord::insert(&rec1).await.expect("插入群聊消息失败"));
        assert!(
            !GroupChatRecord::insert(&rec1).await.expect("插入群聊消息失败"),
            "同 nano_id 应去重"
        );

        let rec2 = GroupChatRecord {
            id: 0,
            nano_id: "g2".to_string(),
            text_type: 0,
            raw: "second".to_string(),
            group_id: group.to_string(),
            send_user: ME.to_string(),
            timestamp: 200,
            server_id: None,
        };
        insert_group_chat_record(&rec2).await.expect("插入群聊消息失败");

        let list = query_group_chat_record_from_db(group, 10, 0).await.expect("查询群聊失败");
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|m| m.recv_user == group));

        let last = query_last_group_chat_record(group)
            .await
            .expect("查询最新群聊失败")
            .expect("应存在最新群聊消息");
        assert_eq!(last.nano_id, "g2");

        let by_group =
            GroupChatRecord::query_by_group_id(group, 10, 0).await.expect("查询群聊失败");
        assert_eq!(by_group.len(), 2);

        // 兼容路径: 以 chat_record 存储(recv_user=groupId)的群聊
        let legacy = TextQuicMsgVo {
            nano_id: "g3".to_string(),
            text_type: 0,
            raw: "legacy".to_string(),
            recv_user: group.to_string(),
            send_user: ME.to_string(),
            timestamp: 300,
        };
        assert!(insert_chat_record(&legacy).await.expect("插入群聊消息失败"));
        let legacy_list =
            app_lib::dao::chat_record_db::query_group_chat_record_from_db(group, 10, 0)
                .await
                .expect("查询群聊失败");
        assert_eq!(legacy_list.len(), 1);
        assert_eq!(legacy_list[0].nano_id, "g3");
    })
    .await;
}

#[tokio::test]
async fn system_notification_lifecycle() {
    with_user_db(|_pool| async move {
        let notif1 = SystemNotification {
            id: Some("n1".to_string()),
            title: Some("Title".to_string()),
            content: Some("Content".to_string()),
            created_at: Some(100),
            content_type: Some(0),
            user_id: Some(ME.to_string()),
            biz_id: Some("biz1".to_string()),
            is_read: Some(false),
            level1: Some(1),
            level2: Some(1),
            level3: None,
            level4: None,
            unread_count: Some(1),
            priority: Some(1),
            is_synced: Some(0),
        };
        SystemNotification::insert(&notif1).await.expect("插入通知失败");
        SystemNotification::insert(&notif1).await.expect("重复插入通知失败");

        let notif2 = SystemNotification {
            id: Some("n2".to_string()),
            title: None,
            content: None,
            created_at: Some(200),
            content_type: Some(0),
            user_id: Some(ME.to_string()),
            biz_id: Some("biz2".to_string()),
            is_read: Some(false),
            level1: Some(1),
            level2: Some(3),
            level3: None,
            level4: None,
            unread_count: None,
            priority: Some(1),
            is_synced: Some(0),
        };
        SystemNotification::insert(&notif2).await.expect("插入通知失败");

        let unread =
            SystemNotification::find_all_by_is_read(ME, Some(0)).await.expect("查询未读通知失败");
        assert_eq!(unread.len(), 2);

        let counts = SystemNotification::get_unread_counts(ME).await.expect("获取未读计数失败");
        assert_eq!(counts.contacts, 1);
        assert_eq!(counts.groups, 1);
        assert_eq!(counts.plaza, 0);

        // 按 biz_id 批量已读
        let affected = SystemNotification::batch_read(ME, vec!["biz1".to_string()])
            .await
            .expect("批量已读失败");
        assert_eq!(affected, 1);
        let unread =
            SystemNotification::find_all_by_is_read(ME, Some(0)).await.expect("查询未读通知失败");
        assert_eq!(unread.len(), 1);

        // 已读未同步 -> 标记已同步
        let pending =
            SystemNotification::query_read_not_synced_ids(ME).await.expect("查询待同步失败");
        assert_eq!(pending.len(), 1);
        SystemNotification::mark_read_synced(ME, &pending).await.expect("标记已同步失败");
        assert!(SystemNotification::query_read_not_synced_ids(ME)
            .await
            .expect("查询待同步失败")
            .is_empty());

        // 按层级清除未读(groups: level1=1, level2=3)
        let affected = SystemNotification::clear_unread_by_level(ME, 1, 3, -1, -1)
            .await
            .expect("按层级清除失败");
        assert_eq!(affected, 1);

        // 一键清空剩余未读
        let notif3 = SystemNotification {
            id: Some("n3".to_string()),
            title: None,
            content: None,
            created_at: Some(300),
            content_type: None,
            user_id: Some(ME.to_string()),
            biz_id: None,
            is_read: Some(false),
            level1: None,
            level2: None,
            level3: None,
            level4: None,
            unread_count: None,
            priority: Some(1),
            is_synced: Some(0),
        };
        SystemNotification::insert(&notif3).await.expect("插入通知失败");
        SystemNotification::clear_all_unread(ME).await.expect("清空未读失败");
        assert!(SystemNotification::find_all_by_is_read(ME, Some(0))
            .await
            .expect("查询未读通知失败")
            .is_empty());
    })
    .await;
}

#[tokio::test]
async fn group_and_members_upsert_query_soft_delete() {
    with_user_db(|_pool| async move {
        let group_id = "group-1";
        let mut group = Group {
            id: 0,
            group_id: group_id.to_string(),
            group_name: "闲聊群".to_string(),
            group_icon: String::new(),
            owner_id: ME.to_string(),
            created_at: 100,
            updated_at: 100,
            member_count: 1,
            is_del: 0,
            is_show: 1,
            version: 0,
        };
        Group::insert_group(&group).await.expect("插入群失败");

        // upsert 更新
        group.member_count = 2;
        group.version = 1;
        Group::insert_group(&group).await.expect("更新群失败");

        let fetched =
            Group::query_by_group_id(group_id).await.expect("查询群失败").expect("群不存在");
        assert_eq!(fetched.member_count, 2);
        assert_eq!(fetched.version, 1);

        // 成员 upsert
        let m1 = GroupMember {
            id: 0,
            group_id: group_id.to_string(),
            user_id: ME.to_string(),
            role: 0,
            nickname: "me".to_string(),
            joined_at: 100,
            is_del: 0,
        };
        let m2 = GroupMember {
            id: 0,
            group_id: group_id.to_string(),
            user_id: FRIEND.to_string(),
            role: 1,
            nickname: "friend".to_string(),
            joined_at: 100,
            is_del: 0,
        };
        GroupMember::upsert_members(&[m1, m2]).await.expect("批量插入成员失败");

        let members = GroupMember::query_members(group_id).await.expect("查询成员失败");
        assert_eq!(members.len(), 2);
        let one = GroupMember::query_member(group_id, FRIEND)
            .await
            .expect("查询成员失败")
            .expect("成员不存在");
        assert_eq!(one.role, 1);

        // 我加入的群(join) + 最近群 + 模糊搜索
        let my_groups = Group::query_user_groups(ME).await.expect("查询我的群失败");
        assert_eq!(my_groups.len(), 1);
        let last = Group::get_last_group(ME).await.expect("查询最近群失败").expect("应有群");
        assert_eq!(last.group_id, group_id);
        let hits = Group::search_user_groups(ME, "闲聊").await.expect("搜索群失败");
        assert_eq!(hits.len(), 1);

        // 移除成员后不再出现在我的群列表
        GroupMember::remove_member(group_id, ME).await.expect("移除成员失败");
        assert!(Group::query_user_groups(ME).await.expect("查询我的群失败").is_empty());

        // 软删除群
        Group::soft_delete(group_id).await.expect("软删除群失败");
        assert!(Group::query_by_group_id(group_id).await.expect("查询群失败").is_none());
    })
    .await;
}

#[tokio::test]
async fn user_info_upsert_query_update_delete() {
    with_common_db(|_pool| async move {
        let mut user = UserInfo {
            id: 0,
            uuid: ME.to_string(),
            username: Some("alice".to_string()),
            account: Some("alice_account".to_string()),
            icon: Some("icon.png".to_string()),
            gender: Some(2),
            age: Some(18),
            birthday: Some(0),
            info: Some("hi".to_string()),
            phone: Some("138".to_string()),
            email: Some("a@b.c".to_string()),
            address: Some("sh".to_string()),
            status: Some(0),
            user_type: Some(0),
            created_at: 0,
            updated_at: 0,
        };
        user.upsert().await.expect("upsert 用户失败");
        let fetched =
            UserInfo::query_by_uuid(ME).await.expect("按 uuid 查询失败").expect("用户不存在");
        assert_eq!(fetched.account.as_deref(), Some("alice_account"));

        // upsert 更新
        user.username = Some("bob".to_string());
        user.upsert().await.expect("upsert 用户失败");
        let fetched =
            UserInfo::query_by_uuid(ME).await.expect("按 uuid 查询失败").expect("用户不存在");
        assert_eq!(fetched.username.as_deref(), Some("bob"));

        // 按账号查询
        let by_account = UserInfo::query_by_account("alice_account")
            .await
            .expect("按账号查询失败")
            .expect("用户不存在");
        assert_eq!(by_account.uuid, ME);

        // update_by_uuid
        user.username = Some("carol".to_string());
        assert_eq!(user.update_by_uuid().await.expect("更新用户失败"), 1);
        let fetched = UserInfo::query_by_uuid(ME).await.expect("查询失败").expect("用户不存在");
        assert_eq!(fetched.username.as_deref(), Some("carol"));

        // 新用户 insert
        let u2 = UserInfo {
            id: 0,
            uuid: FRIEND.to_string(),
            username: Some("d".to_string()),
            account: None,
            icon: None,
            gender: None,
            age: None,
            birthday: None,
            info: None,
            phone: None,
            email: None,
            address: None,
            status: None,
            user_type: None,
            created_at: 0,
            updated_at: 0,
        };
        u2.insert().await.expect("插入用户失败");
        assert_eq!(UserInfo::query_all().await.expect("查询全部失败").len(), 2);

        // 删除
        assert_eq!(UserInfo::delete_by_uuid(FRIEND).await.expect("删除用户失败"), 1);
        assert!(UserInfo::query_by_uuid(FRIEND).await.expect("查询失败").is_none());
    })
    .await;
}

#[tokio::test]
async fn user_token_upsert_query_delete() {
    with_common_db(|_pool| async move {
        let token = UserToken {
            id: None,
            user_id: Some(ME.to_string()),
            refresh_token: Some("rt-1".to_string()),
            local_credit: Some("lc".to_string()),
            created_at: Some(100),
            updated_at: Some(100),
            version: Some(0),
        };
        UserToken::upsert(&token).await.expect("upsert token 失败");
        let fetched =
            UserToken::query_by_user_id(ME).await.expect("查询失败").expect("token 不存在");
        assert_eq!(fetched.refresh_token.as_deref(), Some("rt-1"));
        assert_eq!(fetched.version, Some(0));

        // upsert 更新并递增 version
        let token2 = UserToken {
            id: None,
            user_id: Some(ME.to_string()),
            refresh_token: Some("rt-2".to_string()),
            local_credit: Some("lc".to_string()),
            created_at: Some(100),
            updated_at: Some(200),
            version: Some(0),
        };
        UserToken::upsert(&token2).await.expect("upsert token 失败");
        let fetched =
            UserToken::query_by_user_id(ME).await.expect("查询失败").expect("token 不存在");
        assert_eq!(fetched.refresh_token.as_deref(), Some("rt-2"));
        assert_eq!(fetched.version, Some(1), "version 应递增 +1");

        // 按 refresh_token 查询
        let by_rt = UserToken::query_by_refresh_token("rt-2")
            .await
            .expect("查询失败")
            .expect("token 不存在");
        assert_eq!(by_rt.user_id.as_deref(), Some(ME));

        // 无 refresh_token 的 token 不进入有效列表
        let bad = UserToken {
            id: None,
            user_id: Some(FRIEND.to_string()),
            refresh_token: None,
            local_credit: None,
            created_at: Some(1),
            updated_at: Some(1),
            version: Some(0),
        };
        UserToken::upsert(&bad).await.expect("upsert token 失败");
        assert_eq!(UserToken::query_all_valid().await.expect("查询失败").len(), 1);

        UserToken::delete_by_user_id(ME).await.expect("删除失败");
        assert!(UserToken::query_by_user_id(ME).await.expect("查询失败").is_none());
    })
    .await;
}

#[tokio::test]
async fn webrtc_signal_insert_query_and_summary() {
    with_private_db(|_pool| async move {
        insert_webrtc_signal(
            "w1",
            "s1",
            "offer",
            ME,
            FRIEND,
            &serde_json::from_str::<serde_json::Value>(r#"{"sdp":"x"}"#)
                .expect("构造信令 JSON 失败"),
            100,
        )
        .await
        .expect("插入信令失败");
        insert_webrtc_signal(
            "w2",
            "s1",
            "answer",
            FRIEND,
            ME,
            &serde_json::from_str::<serde_json::Value>(r#"{"sdp":"y"}"#)
                .expect("构造信令 JSON 失败"),
            200,
        )
        .await
        .expect("插入信令失败");

        let signals = query_webrtc_signal_by_session("s1").await.expect("按会话查询失败");
        assert_eq!(signals.len(), 2);
        assert_eq!(signals[0].msg_type, "offer");
        assert_eq!(signals[1].msg_type, "answer");

        // save_webrtc_signal: end 会额外写 chat_record 摘要(session::s1)
        save_webrtc_signal(
            "w3",
            "s1",
            "end",
            ME,
            FRIEND,
            &serde_json::from_str::<serde_json::Value>(r#"{"end":true}"#)
                .expect("构造信令 JSON 失败"),
            300,
            "w2",
        )
        .await
        .expect("保存信令失败");
        let signals = query_webrtc_signal_by_session("s1").await.expect("按会话查询失败");
        assert_eq!(signals.len(), 3);

        let summary =
            query_chat_record_by_id_from_db("session::s1", ME).await.expect("查询信令摘要失败");
        assert_eq!(summary.text_type, MSG_TYPE_WEBRTC_SIGNAL);

        // candidate 不写摘要
        save_webrtc_signal(
            "w4",
            "s2",
            "candidate",
            ME,
            FRIEND,
            &serde_json::from_str::<serde_json::Value>(r#"{"candidate":"c1"}"#)
                .expect("构造信令 JSON 失败"),
            400,
            "",
        )
        .await
        .expect("保存信令失败");
        assert!(query_chat_record_by_id_from_db("session::s2", ME).await.is_err());
    })
    .await;
}

#[tokio::test]
async fn chat_record_send_lifecycle() {
    with_private_db(|_pool| async move {
        let send = ChatRecordSend {
            id: 0,
            send_id: "send-1".to_string(),
            msg_id: String::new(),
            text_type: 1,
            platform: 0,
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
            raw: "hello".to_string(),
            send_status: 0,
            retry_count: 0,
        };
        insert_chat_record_send(&send).await.expect("插入发送记录失败");

        let fetched = query_record_send_from_db("send-1").await.expect("查询发送记录失败");
        assert_eq!(fetched.send_status, 0);

        let pending = query_chat_record_send_by_user(ME, FRIEND, vec![0, 2], false)
            .await
            .expect("按用户查询失败");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].send_id, "send-1");

        // 标记发送成功
        update_chat_record_send_success("send-1", "server-msg-1").await.expect("标记成功失败");
        let fetched = query_record_send_from_db("send-1").await.expect("查询发送记录失败");
        assert_eq!(fetched.send_status, 3);
        assert_eq!(fetched.msg_id, "server-msg-1");

        // 更新发送记录
        update_chat_record_send("send-1", "server-msg-1", 2, 3, 200, "retry raw")
            .await
            .expect("更新发送记录失败");
        let fetched = query_record_send_from_db("send-1").await.expect("查询发送记录失败");
        assert_eq!(fetched.send_status, 2);
        assert_eq!(fetched.retry_count, 3);

        // 忽略消息(仅更新状态)
        update_chat_record_send_status("send-1", -1).await.expect("更新状态失败");
        let fetched = query_record_send_from_db("send-1").await.expect("查询发送记录失败");
        assert_eq!(fetched.send_status, -1);

        let pending = query_chat_record_send_by_user(ME, FRIEND, vec![0, 2], false)
            .await
            .expect("按用户查询失败");
        assert!(pending.is_empty(), "已忽略消息不应再进入待发送列表");
    })
    .await;
}

#[tokio::test]
async fn chat_record_ack_lifecycle() {
    with_private_db(|_pool| async move {
        let ack = ChatRecordAck {
            id: 0,
            msg_id: String::new(),
            prev_id: "prev".to_string(),
            send_id: "ack-1".to_string(),
            platform: 0,
            ack_status: 0,
            recv_user: FRIEND.to_string(),
            send_user: ME.to_string(),
            timestamp: 100,
        };
        insert_chat_record_ack(&ack).await.expect("插入 ack 失败");

        let fetched = query_ack_record_from_db("ack-1").await.expect("查询 ack 失败");
        assert_eq!(fetched.ack_status, 0);

        let by_send = query_chat_record_by_send_id("ack-1", FRIEND)
            .await
            .expect("查询 ack 失败")
            .expect("ack 不存在");
        assert_eq!(by_send.send_user, ME);

        update_chat_record_ack("ack-1", 1, "server-id").await.expect("更新 ack 失败");
        let fetched = query_ack_record_from_db("ack-1").await.expect("查询 ack 失败");
        assert_eq!(fetched.ack_status, 1);
        assert_eq!(fetched.msg_id, "server-id");

        update_chat_record_ack_prev_id("ack-1", "new-prev").await.expect("更新 prev_id 失败");
        let fetched = query_ack_record_from_db("ack-1").await.expect("查询 ack 失败");
        assert_eq!(fetched.prev_id, "new-prev");
    })
    .await;
}

#[tokio::test]
async fn group_message_ack_lifecycle() {
    with_private_db(|_pool| async move {
        let ack = GroupMessageAck {
            id: 0,
            nano_id: String::new(),
            local_nano_id: "local-1".to_string(),
            group_uuid: "group-1".to_string(),
            send_user: ME.to_string(),
            text_type: 2001,
            ack_status: 0,
            raw: "group msg".to_string(),
            timestamp: 100,
        };
        insert_group_message_ack(&ack).await.expect("插入群 ack 失败");

        let fetched = query_group_message_ack_by_local_nano_id("local-1")
            .await
            .expect("查询失败")
            .expect("ack 不存在");
        assert_eq!(fetched.ack_status, 0);

        let pending = query_pending_group_message_acks("group-1").await.expect("查询待确认失败");
        assert_eq!(pending.len(), 1);

        update_group_message_ack_status("local-1", "server-nano", 1).await.expect("更新 ack 失败");
        let fetched = query_group_message_ack_by_nano_id("server-nano")
            .await
            .expect("查询失败")
            .expect("ack 不存在");
        assert_eq!(fetched.ack_status, 1);
        assert!(query_pending_group_message_acks("group-1")
            .await
            .expect("查询待确认失败")
            .is_empty());
    })
    .await;
}

#[tokio::test]
async fn group_message_read_upsert_query() {
    with_private_db(|_pool| async move {
        let rec = GroupMessageRead {
            id: 0,
            nano_id: "n1".to_string(),
            group_uuid: "g1".to_string(),
            user_uuid: ME.to_string(),
            timestamp: 100,
        };
        update_group_message_read(&rec).await.expect("更新已读失败");
        let fetched =
            query_group_message_read("g1", ME).await.expect("查询已读失败").expect("已读不存在");
        assert_eq!(fetched.timestamp, 100);

        // 再次更新(UPDATE 分支)
        let rec2 = GroupMessageRead {
            id: 0,
            nano_id: "n2".to_string(),
            group_uuid: "g1".to_string(),
            user_uuid: ME.to_string(),
            timestamp: 200,
        };
        update_group_message_read(&rec2).await.expect("更新已读失败");
        let fetched =
            query_group_message_read("g1", ME).await.expect("查询已读失败").expect("已读不存在");
        assert_eq!(fetched.timestamp, 200);
        assert_eq!(fetched.nano_id, "n2");

        // 另一个群(INSERT 分支)
        let rec3 = GroupMessageRead {
            id: 0,
            nano_id: "n3".to_string(),
            group_uuid: "g2".to_string(),
            user_uuid: ME.to_string(),
            timestamp: 300,
        };
        update_group_message_read(&rec3).await.expect("更新已读失败");

        let last = query_group_last_read_msg(ME, 150).await.expect("查询已读失败");
        assert_eq!(last.len(), 2, "g1(200) 与 g2(300) 都应大于 150");

        let only_g2 = query_group_last_read_msg(ME, 250).await.expect("查询已读失败");
        assert_eq!(only_g2.len(), 1);
        assert_eq!(only_g2[0].group_uuid, "g2");
    })
    .await;
}

// ---------- 任务12: 同步域(水位表 + 任务表) ----------

/// 任务12: 水位双写 —— synced_id 只前进, hist_floor 单调只向下。
#[tokio::test]
async fn sync_state_pull_position_forward_and_floor_monotonic() {
    with_user_db(|_pool| async move {
        let su = "00000000-0000-0000-0000-0000000000aa";

        // 首次建立: synced_id=5230, hist_floor=5221
        upsert_pull_position(su, 5230, Some(5221)).await.expect("写水位失败");
        let st = get_state(su).await.expect("读水位失败").expect("应有水位行");
        assert_eq!(st.synced_id, 5230);
        assert_eq!(st.hist_floor, Some(5221));
        assert_eq!(st.backfill, BACKFILL_NONE);

        // synced_id 只前进: 回退值被忽略
        upsert_pull_position(su, 5000, None).await.expect("写水位失败");
        assert_eq!(get_state(su).await.expect("读水位失败").expect("应有水位行").synced_id, 5230);

        // hist_floor 取 min(只向下): 上方批次不改, 下方批次下压
        upsert_pull_position(su, 5230, Some(5300)).await.expect("写水位失败");
        assert_eq!(
            get_hist_floor(su).await.expect("读 floor 失败"),
            Some(5221),
            "上方批次不应抬高 floor"
        );
        upsert_pull_position(su, 5230, Some(5100)).await.expect("写水位失败");
        assert_eq!(
            get_hist_floor(su).await.expect("读 floor 失败"),
            Some(5100),
            "下方批次应下压 floor"
        );
    })
    .await;
}

/// 任务12: 回填完成态写入与读取。
#[tokio::test]
async fn sync_state_backfill_status_roundtrip() {
    with_user_db(|_pool| async move {
        let su = "00000000-0000-0000-0000-0000000000bb";
        assert!(get_state(su).await.expect("读水位失败").is_none(), "无行应为 None");
        set_backfill_status(su, BACKFILL_DONE).await.expect("写完成态失败");
        let st = get_state(su).await.expect("读水位失败").expect("应建立水位行");
        assert_eq!(st.backfill, BACKFILL_DONE);
        complete_backfill(su).await.expect("写完成态失败");
        assert_eq!(
            get_state(su).await.expect("读水位失败").expect("应有水位行").backfill,
            BACKFILL_DONE
        );
    })
    .await;
}

/// 任务12: 缺口检测 = last_message_id > COALESCE(synced_id, 0)。
#[tokio::test]
async fn sync_state_gap_detection() {
    with_user_db(|pool| async move {
        for (su, last_id) in [("su-gap", 5230i64), ("su-eq", 5000i64), ("su-none", 100i64)] {
            sqlx::query(
                r#"INSERT INTO chat_session
                     (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user,
                      session_type, is_show, is_top, session_uuid, last_message_id)
                   VALUES ('', 0, 0, 0, '', ?1, ?2, 1, 1, 0, ?1, ?3)"#,
            )
            .bind(su)
            .bind(ME)
            .bind(last_id)
            .execute(&pool)
            .await
            .expect("插入 chat_session 失败");
        }
        upsert_pull_position("su-eq", 5000, None).await.expect("写水位失败");
        upsert_pull_position("su-none", 0, None).await.expect("写水位失败");

        let gaps = list_gap_sessions(ME).await.expect("缺口检测失败");
        let mut names: Vec<String> = gaps.iter().map(|(s, _)| s.clone()).collect();
        names.sort();
        assert_eq!(
            names,
            vec!["su-gap".to_string(), "su-none".to_string()],
            "只检出 last_message_id > synced_id"
        );
    })
    .await;
}

/// 任务12: 任务入队 → 查重 → 领取 → 记录 → 成功/失败; 批次视图聚合。
#[tokio::test]
async fn sync_task_enqueue_claim_finish_and_history() {
    with_user_db(|_pool| async move {
        let batch = 1_700_000_000_000i64;
        assert!(!has_pending(SYNC_KIND_BACKFILL, "su1").await.expect("查重失败"));
        enqueue(batch, "su1", SYNC_KIND_BACKFILL).await.expect("入队失败");
        assert!(has_pending(SYNC_KIND_BACKFILL, "su1").await.expect("查重失败"), "入队后应有 pending");
        enqueue(batch, "su2", SYNC_KIND_GAP).await.expect("入队失败");

        let task = claim_pending(SYNC_KIND_BACKFILL).await.expect("领取失败").expect("应领到任务");
        assert_eq!(task.session_uuid, "su1");
        assert_eq!(task.status, SYNC_STATUS_RUNNING);
        assert!(
            has_pending(SYNC_KIND_BACKFILL, "su1").await.expect("查重失败"),
            "执行中仍算 pending"
        );

        record_batch(task.id, 3, 7).await.expect("记录失败");
        mark_success(task.id).await.expect("置成功失败");
        assert!(
            !has_pending(SYNC_KIND_BACKFILL, "su1").await.expect("查重失败"),
            "成功后不应 pending"
        );

        // 失败分支: attempt+1, last_error 非空
        enqueue(batch, "su3", SYNC_KIND_BACKFILL).await.expect("入队失败");
        let t3 = claim_pending(SYNC_KIND_BACKFILL).await.expect("领取失败").expect("应领到任务");
        mark_failed(t3.id, "boom").await.expect("置失败失败");
        let detail = list_batch_tasks(batch).await.expect("批明细失败");
        let t3 = detail.iter().find(|t| t.session_uuid == "su3").expect("应有 su3");
        assert_eq!(t3.status, SYNC_STATUS_FAILED);
        assert_eq!(t3.attempt, 1);
        assert_eq!(t3.last_error.as_deref(), Some("boom"));

        let sums = history().await.expect("批次视图失败");
        assert_eq!(sums.len(), 1, "同一 batch_id 聚为一批");
        assert_eq!(sums[0].total, 3);
        assert_eq!(sums[0].success, 1);
        assert_eq!(sums[0].failed, 1);
        assert_eq!(sums[0].pending, 1, "kind=0 的 su2 仍待执行");
    })
    .await;
}

/// 任务12: 批次保留 —— 仅清理「全终态且不在最新 50 批内」, pending 永不清。
#[tokio::test]
async fn sync_task_prune_keeps_recent_and_pending() {
    with_user_db(|_pool| async move {
        for b in 0..60i64 {
            let id = enqueue(1000 + b, &format!("su-{b}"), SYNC_KIND_BACKFILL).await.expect("入队失败");
            mark_success(id).await.expect("置成功失败");
        }
        // 1 条超龄 pending(最早批)
        enqueue(1, "su-pending", SYNC_KIND_BACKFILL).await.expect("入队失败");

        let removed = prune_batches(50).await.expect("清理失败");
        assert!(removed > 0, "应清理超龄终态行");
        let sums = history().await.expect("批次视图失败");
        assert_eq!(sums.len(), 51, "最新 50 批 + 含 pending 的最早批");
        let pending_left = sums.iter().find(|s| s.batch_id == 1).expect("含 pending 的批应保留");
        assert_eq!(pending_left.pending, 1);
    })
    .await;
}

/// 任务12: 启动复位 —— 执行中 → 待执行, worker 可续跑。
#[tokio::test]
async fn sync_task_reset_running() {
    with_user_db(|_pool| async move {
        let id = enqueue(7, "su-r", SYNC_KIND_BACKFILL).await.expect("入队失败");
        let t = claim_pending(SYNC_KIND_BACKFILL).await.expect("领取失败").expect("应领到任务");
        assert_eq!(t.id, id);
        assert_eq!(t.status, SYNC_STATUS_RUNNING);
        let n = reset_running().await.expect("复位失败");
        assert_eq!(n, 1);
        let t = claim_pending(SYNC_KIND_BACKFILL).await.expect("领取失败").expect("复位后应可再领");
        assert_eq!(t.id, id);
        assert_eq!(t.status, SYNC_STATUS_RUNNING);
    })
    .await;
}

/// 任务12: 列迁移 —— 旧库 synced_id 搬运到水位表并删列(幂等)。
#[tokio::test]
async fn chat_session_synced_id_migration() {
    with_user_db(|pool| async move {
        // 重建旧结构(含 synced_id), 模拟任务07 已交付库
        sqlx::query("DROP TABLE IF EXISTS chat_session").execute(&pool).await.expect("删表失败");
        sqlx::query(
            r#"CREATE TABLE chat_session (
                id INTEGER PRIMARY KEY AUTOINCREMENT, nano_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
                send_user TEXT NOT NULL, recv_user TEXT NOT NULL, text_type INTEGER NOT NULL DEFAULT 0,
                unread_count INTEGER NOT NULL DEFAULT 0, last_message TEXT NOT NULL,
                is_show INTEGER NOT NULL DEFAULT 1, is_top INTEGER NOT NULL DEFAULT 0,
                session_type INTEGER NOT NULL DEFAULT 0, session_uuid TEXT DEFAULT NULL,
                synced_id INTEGER NOT NULL DEFAULT 0, UNIQUE(send_user, recv_user), UNIQUE(session_uuid))"#,
        )
        .execute(&pool)
        .await
        .expect("建旧表失败");
        sqlx::query(
            r#"INSERT INTO chat_session
                 (nano_id, timestamp, text_type, unread_count, last_message, send_user, recv_user,
                  session_type, is_show, is_top, session_uuid, synced_id)
               VALUES ('', 0, 0, 0, '', 'p', ?1, 1, 1, 0, 'su-mig', 42)"#,
        )
        .bind(ME)
        .execute(&pool)
        .await
        .expect("插旧行失败");

        init_user_ddl(&pool).await.expect("重跑迁移失败");

        let st = get_state("su-mig").await.expect("读水位失败").expect("应搬运水位行");
        assert_eq!(st.synced_id, 42, "synced_id 应搬入水位表");
        let cols = sqlx::query("PRAGMA table_info(chat_session)").fetch_all(&pool).await.expect("读列失败");
        let names: Vec<String> = cols.iter().map(|r| r.get::<String, _>("name")).collect();
        assert!(!names.contains(&"synced_id".to_string()), "synced_id 列应已删除: {names:?}");
        assert!(names.contains(&"last_message_id".to_string()), "应新增 last_message_id: {names:?}");

        // 幂等: 再跑一次不报错
        init_user_ddl(&pool).await.expect("迁移应幂等");
    })
    .await;
}
