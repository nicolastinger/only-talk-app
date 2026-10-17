//! WebRTC 信令 handler(含 ICE candidate 解析)。

use log::{info, warn};
use serde::{Deserialize, Serialize};

use crate::models::bo::text_msg::TextQuicMsg;
use crate::models::vo::text_quic_msg::TextQuicMsgVo;
use crate::service::user_service::get_user_info;
use crate::utils::app_emit;

#[derive(Debug, Serialize, Deserialize)]
pub struct WebRTCSignalMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub sender: String,
    pub receiver: String,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(default)]
    pub prev_id: Option<String>,
    pub data: serde_json::Value,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct IceCandidateData {
    candidate: Option<String>,
    #[serde(rename = "sdpMid")]
    sdp_mid: Option<String>,
    #[serde(rename = "sdpMLineIndex")]
    sdp_mline_index: Option<u16>,
    #[serde(rename = "usernameFragment")]
    username_fragment: Option<String>,
}

struct ParsedCandidate {
    ip: String,
    port: u16,
    candidate_type: String,
}

pub(crate) async fn process_webrtc_signal(text_quic_msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    let msg = TextQuicMsgVo::from(text_quic_msg)?;
    let me = get_user_info("uuid").await?;

    // 自己另一台设备同步回推的信令(self-echo)：不回灌前端，避免本端自连回环
    if msg.send_user == me {
        info!(
            "self-echo 跳过 WebRTC 信令: send_user={} recv_user={}",
            msg.send_user, msg.recv_user
        );
        return Ok(());
    }

    let signal: WebRTCSignalMessage = serde_json::from_str(&msg.raw)?;

    info!(
        "收到 WebRTC 信令消息 - type: {}, sender: {}, receiver: {}",
        signal.msg_type, signal.sender, signal.receiver
    );

    if signal.msg_type == "candidate" {
        info!("开始解析 ICE candidate, data: {:?}", signal.data);

        match serde_json::from_value::<IceCandidateData>(signal.data.clone()) {
            Ok(candidate_data) => match &candidate_data.candidate {
                Some(candidate_str) => {
                    info!("ICE candidate 数据解析成功, candidate 字符串: {}", candidate_str);

                    if let Some(parsed) = parse_ice_candidate(candidate_str) {
                        info!(
                            "解析 ICE candidate - type: {}, ip: {}, port: {}",
                            parsed.candidate_type, parsed.ip, parsed.port
                        );
                    } else {
                        warn!(
                            "parse_ice_candidate 返回 None, 无法解析 candidate 字符串: {}",
                            candidate_str
                        );
                    }
                }
                None => {
                    warn!("ICE candidate 字段为空，可能是候选收集完成信号");
                }
            },
            Err(e) => {
                warn!("解析 IceCandidateData 失败: {}", e);
            }
        }
    }

    // 转发给前端（保持原始信令格式）；纯实时信令，不落库（服务端只转发不存储）
    let payload = serde_json::to_string(&msg)?;
    app_emit::emit("webrtc_signal", payload)?;

    Ok(())
}

fn parse_ice_candidate(candidate_str: &str) -> Option<ParsedCandidate> {
    let parts: Vec<&str> = candidate_str.split_whitespace().collect();

    if parts.is_empty() || !parts[0].starts_with("candidate:") {
        return None;
    }

    if parts.len() < 8 {
        return None;
    }

    let ip = parts[4].to_string();
    let port: u16 = parts[5].parse().ok()?;
    let candidate_type = parts[7].to_string();

    Some(ParsedCandidate { ip, port, candidate_type })
}
