import {
  HTTP_METHOD,
  TALK_API,
  FriendRequestInfoDTO,
  BasicUser,
} from "@workspace/types";
import { invoke_rust } from "../httpService";
import { invoke } from "@tauri-apps/api/core";

export const get_friend_list = async () => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/friend/get_friend",
    ""
  );
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

export const sign_up = async (basic_user: BasicUser) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/sign_up",
    JSON.stringify(basic_user)
  );
};

export const search_user_by_account = async (account: string) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/user/get_user_by_account/" + account,
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
