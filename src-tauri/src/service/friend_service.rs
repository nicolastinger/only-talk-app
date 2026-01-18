use crate::entity::friend::Friend;
use crate::service::user_service::get_user_info;
use crate::dao::friend_db::update_friend_info_db;
use crate::utils::global_static_str::{QUIC_SERVER_ADDR, TALK_API};
use crate::utils::http_utils::post_request;
use crate::vo::friend_vo::FriendListVO;
use crate::vo::http_response::Response;
use crate::{
    entity::system_notification::SystemNotification, dao::friend_db::query_friend_info_db,
};
use anyhow::anyhow;
use log::{error, info};
use serde_json::Value;
use uuid::Uuid;

pub async fn process_friend_notify_message(
    system_notification: SystemNotification,
) -> Result<(), anyhow::Error> {
    // 处理好友通知
    match system_notification.level3.ok_or(anyhow!("level3为空"))? {
        1 => {
            // 好友发起请求通知
            info!("好友发起请求通知 {:?}", system_notification);
        }
        2 => {
            // 处理好友通知
            info!("处理好友通知 {:?}", system_notification);
            // 同步最新好友列表
            update_friend_list().await?;
        }
        _ => {
            // 处理其他好友通知
            info!("处理其他好友通知 {:?}", system_notification);
        }
    }
    Ok(())
}

/// 获取好友列表
pub async fn update_friend_list() -> Result<(), anyhow::Error> {
    // 获取本地最新update的好友
    let uuid = get_user_info(&"uuid".to_string()).await?;
    let res = query_friend_info_db(&uuid).await?;
    let mut last_uuid = Uuid::now_v7().to_string();
    let mut last_version = 0;
    if !res.is_empty() {
        let last_update_friend = res.into_iter().max_by_key(|f| f.updated_at);
        // 现在last_update_friend是按updated_at倒序的最后一条记录
        if last_update_friend.is_some() {
            let last_update_friend = last_update_friend.expect("获取最后更新好友失败");
            last_uuid = last_update_friend.friend_id;
            last_version = last_update_friend.version;
        }
    }
    let url = format!(
        "{}/friend/get_friend/{}/{}",
        TALK_API, &last_uuid, last_version
    );
    let result = post_request(url, String::new())
        .await
        .map_err(|e| anyhow!(e))?;

    let data = result.body;
    info!("获取好友列表结果 {:?}", data);
    let response: Response = serde_json::from_str(&data)?;

    // 处理不同类型的响应数据
    match response.data {
        Some(Value::Array(arr)) => {
            // 将数组中的每个元素分别转换为FriendListVO对象
            for item in arr {
                let friend_vo: FriendListVO = serde_json::from_value(item)?;

                let friend = Friend {
                    id: 0,
                    created_at: friend_vo.created_at,
                    updated_at: friend_vo.updated_at,
                    friend_id: friend_vo.uuid,
                    friend_account: friend_vo.account,
                    friend_name: friend_vo.username,
                    friend_icon: friend_vo.icon,
                    friend_info: friend_vo.info,
                    friend_status: 0,
                    me: uuid.clone(),
                    is_del: friend_vo.is_del,
                    is_block: 0,
                    is_mute: 0,
                    is_top: 0,
                    is_show: 1,
                    version: friend_vo.version,
                };
                update_friend_info_db(&friend)
                    .await
                    .unwrap_or_else(|e| error!("更新好友信息失败 {:?}", e))
            }
            // TODO: 在这里处理好友列表，比如保存到数据库
        }
        _ => {
            // 无数据
            info!("无数据返回");
        }
    }

    Ok(())
}
