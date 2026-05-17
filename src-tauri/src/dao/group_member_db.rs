use crate::entity::group_member::GroupMember;

pub async fn upsert_group_members(members: &[GroupMember]) -> Result<(), anyhow::Error> {
    GroupMember::upsert_members(members).await
}

pub async fn insert_group_member(member: &GroupMember) -> Result<(), anyhow::Error> {
    GroupMember::insert_member(member).await
}

pub async fn remove_group_member(group_id: &str, user_id: &str) -> Result<(), anyhow::Error> {
    GroupMember::remove_member(group_id, user_id).await
}

pub async fn query_group_members(group_id: &str) -> Result<Vec<GroupMember>, anyhow::Error> {
    GroupMember::query_members(group_id).await
}

pub async fn query_group_member(
    group_id: &str,
    user_id: &str,
) -> Result<Option<GroupMember>, anyhow::Error> {
    GroupMember::query_member(group_id, user_id).await
}
