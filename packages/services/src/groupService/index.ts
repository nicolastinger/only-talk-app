import { CreateGroupRequest, GroupMemberVo, GroupVo } from "@workspace/types";
import { invoke } from "@tauri-apps/api/core";

export const get_group_list = async (): Promise<GroupVo[]> => {
  return await invoke("get_group_list");
};

export const get_group_members = async (
  groupId: string,
): Promise<GroupMemberVo[]> => {
  return await invoke("get_group_members", { groupId });
};

export const get_group_info = async (groupId: string): Promise<GroupVo> => {
  return await invoke("get_group_info_command", { groupId });
};

export const create_group = async (
  request: CreateGroupRequest,
): Promise<GroupVo> => {
  return await invoke("create_group_command", { request });
};

export const invite_group_members = async (
  groupId: string,
  userIds: string[],
): Promise<void> => {
  return await invoke("invite_group_members_command", { groupId, userIds });
};

export const join_group = async (groupId: string): Promise<void> => {
  return await invoke("join_group_command", { groupId });
};

export const leave_group = async (groupId: string): Promise<void> => {
  return await invoke("leave_group_command", { groupId });
};

export const remove_group_member = async (
  groupId: string,
  userId: string,
): Promise<void> => {
  return await invoke("remove_group_member_command", { groupId, userId });
};

export const sync_group_list = async (): Promise<void> => {
  return await invoke("sync_group_list_command");
};

export const sync_group_members = async (
  groupId: string,
): Promise<GroupMemberVo[]> => {
  return await invoke("sync_group_members_command", { groupId });
};

export const create_group_chat_session = async (
  groupId: string,
): Promise<void> => {
  return await invoke("create_group_chat_session_command", { groupId });
};
