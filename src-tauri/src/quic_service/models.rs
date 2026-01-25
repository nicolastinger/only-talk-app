use std::sync::Arc;

use quinn::SendStream;
use tokio::sync::Mutex;

pub struct TargetSendStream {
    pub addr: String,
    pub send_stream: Arc<Mutex<SendStream>>,
    pub is_server: bool,
}
