import {
  HTTP_METHOD,
  TALK_API,
  FriendRequestInfoDTO,
  UserInfo,
  UserInfoWithCache,
  QuicServerInfo,
  HttpResponse,
  UpdateUserDTO,
  FriendVo,
  SignUpStep1Request,
  SendVerifyCodeRequest,
  CompleteProfileRequest,
  BlackListVo,
} from "@workspace/types";
import { invoke_rust } from "../httpService";
import { invoke } from "@tauri-apps/api/core";

export const get_friend_list = async (): Promise<FriendVo[]> => {
  return await invoke<FriendVo[]>("get_friend_list");
};

export const get_friend_info = async (uuid: string) => {
  return await invoke("get_friend_info", {
    friendUuid: uuid,
  });
};

export const add_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/integrated/add_friend_with_notify",
    JSON.stringify(friend)
  );
};

export const process_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/friend/process_friend",
    JSON.stringify(friend)
  );
};

export const sign_up_step1 = async (request: SignUpStep1Request) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/sign_up_step1",
    JSON.stringify(request)
  );
};

export const complete_profile = async (request: CompleteProfileRequest) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/complete_profile",
    JSON.stringify(request)
  );
};

export const send_verify_code = async (request: SendVerifyCodeRequest) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/send_verify_code",
    JSON.stringify(request)
  );
};

export const search_user_by_account = async (account: string) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/get_user_by_account/" + account,
    ""
  );
};

/** @deprecated 后端没有此接口，请使用 POST /user/me 获取当前用户，或 get_cached_user_info 查本地缓存 */
export const get_user_info_by_uuid = async (uuid: string) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/get_user_by_uuid/" + uuid,
    ""
  );
};

export const process_friend_request = async (
  friendRequestInfoDTO: FriendRequestInfoDTO
) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    "/integrated/process_friend_with_notify",
    JSON.stringify(friendRequestInfoDTO)
  );
};

export const get_friend_request_list = async (
  friendRequestInfoDTO: FriendRequestInfoDTO
) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    "/friend/get_friend_request_list",
    JSON.stringify(friendRequestInfoDTO)
  );
};

export const get_accept_friend_request_list = async (
  friendRequestInfoDTO: FriendRequestInfoDTO
) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    "/friend/get_accept_friend_request_list",
    JSON.stringify(friendRequestInfoDTO)
  );
};

export const delete_friend = async (friendUuid: string) => {
  return await invoke("delete_friend_command", {
    friendUuid,
  });
};

export const block_friend = async (friendUuid: string) => {
  return await invoke("block_friend_command", {
    friendUuid,
  });
};

export const unblock_friend = async (friendUuid: string) => {
  return await invoke("unblock_friend_command", {
    friendUuid,
  });
};

export const get_black_list = async (): Promise<BlackListVo[]> => {
  return await invoke<BlackListVo[]>("get_black_list");
};

export const cache_user_info = async (userInfo: UserInfo) => {
  return await invoke("cache_user_info", {
    userInfo,
  });
};

export const get_cached_user_info = async (uuid: string) => {
  return await invoke<UserInfo | null>("get_cached_user_info", {
    uuid,
  });
};

export const get_cached_user_info_by_account = async (account: string) => {
  return await invoke<UserInfo | null>("get_cached_user_info_by_account", {
    account,
  });
};

export const get_user_info_with_cache = async (uuid: string) => {
  return await invoke<UserInfoWithCache>("get_user_info_with_cache", {
    uuid,
  });
};

export const refresh_user_info = async (uuid: string) => {
  return await invoke<UserInfo>("refresh_user_info", {
    uuid,
  });
};

export const get_quic_servers = async (): Promise<QuicServerInfo[]> => {
  const response: HttpResponse = await invoke("get_request", {
    url: TALK_API + "/integrated/quic_servers",
  });
  const data = JSON.parse(response.body);
  if (data.code !== 200) {
    console.error("获取QUIC节点信息失败:", data.message);
    return [];
  }
  return data.data as QuicServerInfo[];
};

export const update_user_info = async (updateDto: UpdateUserDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/update",
    JSON.stringify(updateDto)
  );
};
