//! 心跳 ping handler。

use log::info;

use crate::models::bo::text_msg::TextQuicMsg;
use crate::service::user_service::insert_user_info;
use crate::utils::time::get_now_time_stamp_as_millis;

pub(crate) async fn process_ping_msg(msg: TextQuicMsg) -> Result<(), anyhow::Error> {
    info!("{:?} 收到quic服务器的ping消息", msg.recv_user);
    insert_user_info("ping_lost_count", "0").await?;
    let now = get_now_time_stamp_as_millis().unwrap_or(0).to_string();
    insert_user_info("last_pong_time", &now).await?;
    Ok(())
}
