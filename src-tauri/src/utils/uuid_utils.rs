use uuid::Uuid;

pub fn is_uuid(s: &str) -> bool {
    Uuid::parse_str(s).is_ok()
}
