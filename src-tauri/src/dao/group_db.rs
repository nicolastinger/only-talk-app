use crate::entity::group::Group;

pub async fn upsert_group(group: &Group) -> Result<(), anyhow::Error> {
    Group::insert_group(group).await
}

pub async fn query_group_by_id(group_id: &str) -> Result<Option<Group>, anyhow::Error> {
    Group::query_by_group_id(group_id).await
}

pub async fn query_group_list(me: &str) -> Result<Vec<Group>, anyhow::Error> {
    Group::query_user_groups(me).await
}

pub async fn search_group_list(me: &str, keyword: &str) -> Result<Vec<Group>, anyhow::Error> {
    Group::search_user_groups(me, keyword).await
}

pub async fn soft_delete_group(group_id: &str) -> Result<(), anyhow::Error> {
    Group::soft_delete(group_id).await
}

pub async fn get_last_group(me: &str) -> Result<Option<Group>, anyhow::Error> {
    Group::get_last_group(me).await
}
