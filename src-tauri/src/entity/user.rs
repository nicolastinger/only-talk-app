use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct SignInResult {
    pub code: u16,
    pub data: String,
    pub message: String,
}
