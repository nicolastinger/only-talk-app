import { invoke } from "@tauri-apps/api/core";
import { TALK_API, GroupVo, GroupMemberVo } from "@workspace/types";

const BASE = TALK_API;

function getHeaders(): HeadersInit {
  const token = localStorage.getItem("token") || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: getHeaders(),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const json = await res.json();
  if (json.code === 200) {
    return json.data as T;
  }
  throw new Error(json.message || "请求失败");
}

// ========== 远程 API（直接调用）==========

export const get_group_list = async (): Promise<GroupVo[]> => {
  return request<GroupVo[]>("POST", "/group/chat/my/list");
};

export const get_group_members = async (
  groupId: string,
): Promise<GroupMemberVo[]> => {
  return request<GroupMemberVo[]>("GET", `/group/chat/member/list/${groupId}`);
};

export const get_group_info = async (groupId: string): Promise<GroupVo> => {
  return request<GroupVo>("GET", `/group/chat/info/${groupId}`);
};

export const create_group = async (
  dto: { group_name: string; avatar?: string; max_members?: number },
): Promise<GroupVo> => {
  return request<GroupVo>("POST", "/group/chat/create", dto);
};

export const invite_group_members = async (
  groupId: string,
  userUuids: string[],
): Promise<void> => {
  return request("POST", "/group/chat/member/add", {
    group_uuid: groupId,
    user_uuids: userUuids,
  });
};

export const join_group = async (groupId: string): Promise<void> => {
  return request("POST", `/group/chat/join/${groupId}`);
};

export const leave_group = async (groupId: string): Promise<void> => {
  return request("POST", `/group/chat/member/quit/${groupId}`);
};

export const remove_group_member = async (
  groupId: string,
  userId: string,
): Promise<void> => {
  return request(
    "DELETE",
    `/group/chat/member/remove/${groupId}/${userId}`,
  );
};

// ========== 本地操作（Tauri invoke）==========

export const create_group_chat_session = async (
  groupId: string,
): Promise<void> => {
  await invoke("create_group_chat_session_command", { group_id: groupId });
};
