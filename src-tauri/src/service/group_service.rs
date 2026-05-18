use anyhow::anyhow;
use log::{error, info};
use serde_json::Value;
use uuid::Uuid;

use crate::cmd::api_controller::post_request;
use crate::dao::group_db::{get_last_group, query_group_list, soft_delete_group, upsert_group};
use crate::dao::group_member_db::{
    insert_group_member, query_group_members, remove_group_member, upsert_group_members,
};
use crate::dao::session_db::hide_group_session_db;
use crate::dto::http_result::HttpResult;
use crate::entity::group::Group;
use crate::entity::group_member::GroupMember;
use crate::entity::system_notification::SystemNotification;
use crate::service::user_service::get_user_info;
use crate::utils::global_static_str::TALK_API;
use crate::utils::time::get_now_time_stamp_as_millis;
use crate::vo::group_vo::{CreateGroupApiRequest, CreateGroupRequest, GroupMemberVo, GroupVo};

fn parse_http_result(data: &str) -> Result<HttpResult, anyhow::Error> {
    serde_json::from_str::<HttpResult>(data).map_err(|e| anyhow!("解析响应失败: {}", e))
}

/// 同步群聊列表
pub async fn sync_group_list() -> Result<(), anyhow::Error> {
    let url = format!("{}/group/chat/my/list", TALK_API);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if let Value::Array(arr) = response.data {
        for item in arr {
            let group_vo: GroupVo = serde_json::from_value(item)?;
            let group = Group {
                id: 0,
                group_id: group_vo.group_uuid.clone(),
                group_name: group_vo.group_name,
                group_icon: group_vo.avatar.unwrap_or_default(),
                owner_id: group_vo.owner_uuid,
                created_at: group_vo.created_at,
                updated_at: get_now_time_stamp_as_millis()?,
                member_count: group_vo.member_count,
                is_del: 0,
                is_show: 1,
                version: 0,
            };
            upsert_group(&group).await.unwrap_or_else(|e| error!("更新群信息失败 {:?}", e));
        }
    }

    Ok(())
}

/// 创建群聊
pub async fn create_group(request: CreateGroupRequest) -> Result<GroupVo, anyhow::Error> {
    let api_request = CreateGroupApiRequest {
        group_name: request.group_name,
        avatar: if request.group_icon.is_empty() {
            None
        } else {
            Some(request.group_icon)
        },
        max_members: None,
    };
    
    let url = format!("{}/group/chat/create", TALK_API);
    let body = serde_json::to_string(&api_request)?;
    info!("创建群聊请求: {}", body);
    let result = post_request(url, body).await.map_err(|e| anyhow!(e))?;
    info!("创建群聊响应: {:?}", result.body);
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("创建群聊失败: {}", response.message));
    }

    let group_vo: GroupVo = serde_json::from_value(response.data)?;

    let now = get_now_time_stamp_as_millis()?;
    let group = Group {
        id: 0,
        group_id: group_vo.group_uuid.clone(),
        group_name: group_vo.group_name.clone(),
        group_icon: group_vo.avatar.clone().unwrap_or_default(),
        owner_id: group_vo.owner_uuid.clone(),
        created_at: group_vo.created_at,
        updated_at: now,
        member_count: group_vo.member_count,
        is_del: 0,
        is_show: 1,
        version: 0,
    };
    upsert_group(&group).await?;

    if !request.member_ids.is_empty() {
        let _ = invite_group_members(&group_vo.group_uuid, request.member_ids).await;
    }

    Ok(group_vo)
}

/// 邀请群成员
pub async fn invite_group_members(
    group_id: &str,
    user_ids: Vec<String>,
) -> Result<(), anyhow::Error> {
    let url = format!("{}/group/chat/member/add", TALK_API);
    let body = serde_json::json!({
        "group_uuid": group_id,
        "user_uuids": user_ids
    }).to_string();
    info!("邀请群成员请求: {}", body);
    let result = post_request(url, body).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("邀请成员失败: {}", response.message));
    }

    sync_group_members(group_id).await?;
    Ok(())
}

/// 加入群聊
pub async fn join_group(group_id: &str) -> Result<(), anyhow::Error> {
    let url = format!("{}/group/chat/join/{}", TALK_API, group_id);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("加入群聊失败: {}", response.message));
    }

    get_group_info(group_id).await?;
    sync_group_members(group_id).await?;
    Ok(())
}

/// 离开群聊
pub async fn leave_group(group_id: &str) -> Result<(), anyhow::Error> {
    let uuid = get_user_info("uuid").await?;
    let url = format!("{}/group/chat/member/quit/{}", TALK_API, group_id);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("离开群聊失败: {}", response.message));
    }

    remove_group_member(group_id, &uuid).await?;
    hide_group_session_db(&uuid, group_id).await?;
    Ok(())
}

/// 移除群成员（群主/管理员操作）
pub async fn remove_group_member_service(
    group_id: &str,
    user_id: &str,
) -> Result<(), anyhow::Error> {
    let url = format!("{}/group/chat/member/remove/{}/{}", TALK_API, group_id, user_id);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("移除成员失败: {}", response.message));
    }

    remove_group_member(group_id, user_id).await?;
    Ok(())
}

/// 同步群成员列表
pub async fn sync_group_members(group_id: &str) -> Result<Vec<GroupMemberVo>, anyhow::Error> {
    let url = format!("{}/group/chat/member/list/{}", TALK_API, group_id);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    let mut member_vos = Vec::new();

    if let Value::Array(arr) = response.data {
        for item in arr {
            let member_vo: GroupMemberVo = serde_json::from_value(item)?;
            let member = GroupMember {
                id: 0,
                group_id: member_vo.group_id.clone(),
                user_id: member_vo.user_id.clone(),
                role: member_vo.role,
                nickname: member_vo.nickname.clone(),
                joined_at: member_vo.joined_at,
                is_del: 0,
            };
            insert_group_member(&member).await.unwrap_or_else(|e| {
                error!("插入群成员失败 {:?}", e);
            });
            member_vos.push(member_vo);
        }
    }

    Ok(member_vos)
}

/// 获取群详情
pub async fn get_group_info(group_id: &str) -> Result<GroupVo, anyhow::Error> {
    let url = format!("{}/group/chat/info/{}", TALK_API, group_id);
    let result = post_request(url, String::new()).await.map_err(|e| anyhow!(e))?;
    let response: HttpResult = parse_http_result(&result.body)?;

    if response.code != 200 {
        return Err(anyhow!("获取群信息失败: {}", response.message));
    }

    let group_vo: GroupVo = serde_json::from_value(response.data)?;

    let group = Group {
        id: 0,
        group_id: group_vo.group_uuid.clone(),
        group_name: group_vo.group_name.clone(),
        group_icon: group_vo.avatar.clone().unwrap_or_default(),
        owner_id: group_vo.owner_uuid.clone(),
        created_at: group_vo.created_at,
        updated_at: get_now_time_stamp_as_millis()?,
        member_count: group_vo.member_count,
        is_del: 0,
        is_show: 1,
        version: 0,
    };
    upsert_group(&group).await?;

    Ok(group_vo)
}

/// 从本地DB获取群列表
pub async fn get_local_group_list() -> Result<Vec<GroupVo>, anyhow::Error> {
    let uuid = get_user_info("uuid").await?;
    let groups = query_group_list(&uuid).await?;
    Ok(groups
        .into_iter()
        .map(|g| GroupVo {
            group_uuid: g.group_id,
            group_name: g.group_name,
            avatar: if g.group_icon.is_empty() { None } else { Some(g.group_icon) },
            owner_uuid: g.owner_id,
            description: None,
            max_members: 500,
            member_count: g.member_count,
            created_at: g.created_at,
            updated_at: g.updated_at,
            status: 1,
        })
        .collect())
}

/// 从本地DB获取群成员列表
pub async fn get_local_group_members(group_id: &str) -> Result<Vec<GroupMemberVo>, anyhow::Error> {
    let members = query_group_members(group_id).await?;
    Ok(members
        .into_iter()
        .map(|m| GroupMemberVo {
            group_id: m.group_id,
            user_id: m.user_id,
            username: String::new(),
            icon: String::new(),
            role: m.role,
            nickname: m.nickname,
            joined_at: m.joined_at,
        })
        .collect())
}

/// 处理群聊通知消息
pub async fn process_group_notify_message(
    notification: SystemNotification,
) -> Result<(), anyhow::Error> {
    match notification.level3.ok_or(anyhow!("level3为空"))? {
        1 => {
            info!("收到群邀请通知 {:?}", notification);
        }
        2 => {
            info!("群信息更新通知，同步群列表");
            sync_group_list().await?;
        }
        3 => {
            info!("群成员变更通知 {:?}", notification);
            if let Some(biz_id) = &notification.biz_id {
                sync_group_members(biz_id).await?;
            }
        }
        _ => {
            info!("处理其他群通知 {:?}", notification);
        }
    }
    Ok(())
}
