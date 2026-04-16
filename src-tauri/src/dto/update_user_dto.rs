use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct UpdateUserDTO {
    pub username: Option<String>,
    pub info: Option<String>,
    pub gender: Option<u8>,
    pub age: Option<u8>,
    pub birthday: Option<i64>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
}
