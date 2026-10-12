//! 聊天消息 raw 在单聊/群聊格式之间的互转（逐条转发用）。
//!
//! 存储格式约定（与前端解析保持一致）：
//! - 单聊(raw)：`TextRecord` / `ImageRecord` / `FileRecord` 的 JSON；
//!   图片/文件记录里的 `biz_id` 指向服务端已上传的文件。
//! - 群聊(raw)：外层 `GroupTextRecord` JSON `{"text":"<内层>","send_user":"..."}`，
//!   其中内层 `text`：文本为纯文本，图片/文件为 `GroupImageRecord` / `GroupFileRecord` JSON。
//!
//! 转发时**复用 `biz_id` 不重新上传**；仅重建记录结构与消息类型。

use anyhow::anyhow;

use crate::entity::chat_record_raw::{ChatRecordRaw, FileRecord, ImageRecord, TextRecord};
use crate::service::chat_service::{GroupFileRecord, GroupImageRecord, GroupTextRecord};
use crate::utils::message_types::{
    MSG_TYPE_FILE, MSG_TYPE_GROUP_FILE, MSG_TYPE_GROUP_IMAGE, MSG_TYPE_GROUP_TEXT, MSG_TYPE_IMAGE,
    MSG_TYPE_TEXT,
};

/// 私聊消息类型集合
pub const PRIVATE_TYPES: [u16; 3] = [MSG_TYPE_TEXT, MSG_TYPE_IMAGE, MSG_TYPE_FILE];
/// 群聊消息类型集合
pub const GROUP_TYPES: [u16; 3] = [MSG_TYPE_GROUP_TEXT, MSG_TYPE_GROUP_IMAGE, MSG_TYPE_GROUP_FILE];

/// 单聊 raw -> 群聊内层 raw，并返回群聊 text_type。
pub fn private_raw_to_group(
    text_type: u16,
    raw: &str,
    send_user: &str,
) -> Result<(u16, String), anyhow::Error> {
    match text_type {
        MSG_TYPE_TEXT => {
            let record = TextRecord::deserialize(raw)?;
            Ok((MSG_TYPE_GROUP_TEXT, record.text))
        }
        MSG_TYPE_IMAGE => {
            let record = ImageRecord::deserialize(raw)?;
            let group = GroupImageRecord {
                biz_id: record.biz_id,
                file_name: record.file_name,
                img_width: record.img_width,
                img_height: record.img_height,
                img_size: record.img_size,
                send_user: send_user.to_string(),
            };
            Ok((MSG_TYPE_GROUP_IMAGE, group.json_serialize()?))
        }
        MSG_TYPE_FILE => {
            let record = FileRecord::deserialize(raw)?;
            let group = GroupFileRecord {
                biz_id: record.biz_id,
                file_name: record.file_name,
                file_size: record.file_size,
                file_type: record.file_type,
                send_user: send_user.to_string(),
            };
            Ok((MSG_TYPE_GROUP_FILE, group.json_serialize()?))
        }
        other => Err(anyhow!("不支持转发到群聊的单聊消息类型: {}", other)),
    }
}

/// 群聊 raw（外层 GroupTextRecord）-> 单聊 raw，并返回单聊 text_type。
pub fn group_raw_to_private(text_type: u16, raw: &str) -> Result<(u16, String), anyhow::Error> {
    let outer = GroupTextRecord::deserialize(raw)?;
    match text_type {
        MSG_TYPE_GROUP_TEXT => {
            let record = TextRecord { prev_id: String::new(), text: outer.text, platform: 0 };
            Ok((MSG_TYPE_TEXT, record.json_serialize()?))
        }
        MSG_TYPE_GROUP_IMAGE => {
            let group = GroupImageRecord::deserialize(&outer.text)?;
            let record = ImageRecord {
                prev_id: String::new(),
                biz_id: group.biz_id,
                file_name: group.file_name,
                is_preview: false,
                img_width: group.img_width,
                img_height: group.img_height,
                img_size: group.img_size,
                platform: 0,
            };
            Ok((MSG_TYPE_IMAGE, record.json_serialize()?))
        }
        MSG_TYPE_GROUP_FILE => {
            let group = GroupFileRecord::deserialize(&outer.text)?;
            let record = FileRecord {
                prev_id: String::new(),
                biz_id: group.biz_id,
                file_name: group.file_name,
                file_size: group.file_size,
                file_type: group.file_type,
                platform: 0,
            };
            Ok((MSG_TYPE_FILE, record.json_serialize()?))
        }
        other => Err(anyhow!("不支持转发到单聊的群聊消息类型: {}", other)),
    }
}

/// 将一条来源消息归一化为目标上下文可直接发送的 `(text_type, raw)`。
///
/// - 单聊 -> 单聊：原样复用 raw（`set_prev_id` 会重写 prev_id）
/// - 单聊 -> 群聊：转为群聊内层格式
/// - 群聊 -> 单聊：解出内层并转为单聊记录
/// - 群聊 -> 群聊：解出内层原样复用（发送时会重新包外层）
pub fn normalize_for_target(
    origin_text_type: u16,
    raw: &str,
    target_group: bool,
    send_user: &str,
) -> Result<(u16, String), anyhow::Error> {
    // 遗留原生文本(0): raw 即纯文本，统一按文本类型重发（单聊 1 / 群聊 2001）
    if origin_text_type == 0 {
        if target_group {
            return Ok((MSG_TYPE_GROUP_TEXT, raw.to_string()));
        }
        let record = TextRecord { prev_id: String::new(), text: raw.to_string(), platform: 0 };
        return Ok((MSG_TYPE_TEXT, record.json_serialize()?));
    }

    let is_group_origin = GROUP_TYPES.contains(&origin_text_type);
    let is_private_origin = PRIVATE_TYPES.contains(&origin_text_type);
    if !is_group_origin && !is_private_origin {
        return Err(anyhow!("不支持转发的消息类型: {}", origin_text_type));
    }

    match (is_group_origin, target_group) {
        (false, false) => Ok((origin_text_type, raw.to_string())),
        (false, true) => private_raw_to_group(origin_text_type, raw, send_user),
        (true, false) => group_raw_to_private(origin_text_type, raw),
        (true, true) => {
            let outer = GroupTextRecord::deserialize(raw)?;
            Ok((origin_text_type, outer.text))
        }
    }
}
