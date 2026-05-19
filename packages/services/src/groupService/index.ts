import {
  HTTP_METHOD,
  TALK_API,
  GroupVo,
  GroupMemberVo,
} from "@workspace/types";
import { invoke_rust } from "../httpService";
import { invoke } from "@tauri-apps/api/core";

function parseData<T>(res: any): T {
  if (!res.netSuccess) {
    throw new Error(res.error || "网络请求失败");
  }
  const json = JSON.parse(res.res.body);
  if (json.code === 200) {
    return json.data as T;
  }
  throw new Error(json.message || "请求失败");
}

export const get_group_list = async (): Promise<GroupVo[]> => {
  const res = await invoke_rust(HTTP_METHOD.GET, TALK_API + "/group/chat/my/list", "");
  return parseData<GroupVo[]>(res);
};

export const get_group_info = async (groupId: string): Promise<GroupVo> => {
  const res = await invoke_rust(HTTP_METHOD.GET, TALK_API + `/group/chat/info/${groupId}`, "");
  return parseData<GroupVo>(res);
};

export const create_group = async (dto: {
  group_name: string;
  avatar?: string;
  description?: string;
  max_members?: number;
}): Promise<GroupVo> => {
  const res = await invoke_rust(HTTP_METHOD.POST, TALK_API + "/group/chat/create", JSON.stringify(dto));
  return parseData<GroupVo>(res);
};

export const update_group = async (dto: {
  group_uuid: string;
  group_name?: string;
  avatar?: string;
  description?: string;
}): Promise<boolean> => {
  const res = await invoke_rust(HTTP_METHOD.PUT, TALK_API + "/group/chat/update", JSON.stringify(dto));
  return parseData<boolean>(res);
};

export const dissolve_group = async (groupUuid: string): Promise<boolean> => {
  const res = await invoke_rust(HTTP_METHOD.DELETE, TALK_API + `/group/chat/dissolve/${groupUuid}`, "");
  return parseData<boolean>(res);
};

export const get_group_members = async (
  groupId: string,
): Promise<GroupMemberVo[]> => {
  const res = await invoke_rust(HTTP_METHOD.GET, TALK_API + `/group/chat/member/list/${groupId}`, "");
  return parseData<GroupMemberVo[]>(res);
};

export const invite_group_members = async (
  groupId: string,
  userUuids: string[],
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/group/chat/member/add",
    JSON.stringify({ group_uuid: groupId, user_uuids: userUuids }),
  );
  return parseData<boolean>(res);
};

export const remove_group_member = async (
  groupUuid: string,
  userUuid: string,
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.DELETE,
    TALK_API + `/group/chat/member/remove/${groupUuid}/${userUuid}`,
    "",
  );
  return parseData<boolean>(res);
};

export const quit_group = async (groupUuid: string): Promise<boolean> => {
  const res = await invoke_rust(HTTP_METHOD.POST, TALK_API + `/group/chat/member/quit/${groupUuid}`, "");
  return parseData<boolean>(res);
};

export const set_member_role = async (dto: {
  group_uuid: string;
  user_uuid: string;
  role: number;
}): Promise<boolean> => {
  const res = await invoke_rust(HTTP_METHOD.PUT, TALK_API + "/group/chat/member/set_role", JSON.stringify(dto));
  return parseData<boolean>(res);
};

export const get_group_message_history = async (dto: {
  group_uuid: string;
  start?: number;
  size?: number;
}): Promise<any[]> => {
  const params = new URLSearchParams();
  params.set("group_uuid", dto.group_uuid);
  if (dto.start !== undefined) params.set("start", String(dto.start));
  if (dto.size !== undefined) params.set("size", String(dto.size));
  const res = await invoke_rust(HTTP_METHOD.GET, TALK_API + `/group/chat/message/history?${params.toString()}`, "");
  return parseData<any[]>(res);
};

export const get_unread_group_messages = async (): Promise<any[]> => {
  const res = await invoke_rust(HTTP_METHOD.GET, TALK_API + "/group/chat/message/unread", "");
  return parseData<any[]>(res);
};

export const create_group_chat_session = async (
  groupId: string,
): Promise<void> => {
  await invoke("create_group_chat_session_command", { groupId: groupId });
};
