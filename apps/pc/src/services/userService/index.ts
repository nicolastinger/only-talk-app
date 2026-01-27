import { HTTP_METHOD, TALK_API } from '@/constants';
import { invoke_rust } from '@/services/httpService';
import { FriendRequestInfoDTO } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core';
import { BasicUser, UserInfo } from '@workspace/types';

const get_friend_list = async () => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/get_friend',
    '',
  );
};

const get_friend_info = async (uuid: string) => {
  return await invoke('get_friend_info', {
    friendUuid: uuid,
  });
};

// 发起好友申请
export const add_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/integrated/add_friend_with_notify',
    JSON.stringify(friend),
  );
};

// 处理好友申请
const process_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/process_friend',
    JSON.stringify(friend),
  );
};

const sign_up = async (basic_user: BasicUser) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/user/sign_up',
    JSON.stringify(basic_user),
  );
};

const search_user_by_account = async (account: string) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/user/get_user_by_account/'+account,
    '',
  );
};

// 处理好友请求
const process_friend_request = async (friendRequestInfoDTO: FriendRequestInfoDTO) => {
  return await invoke_rust(HTTP_METHOD.POST, '/integrated/process_friend_with_notify', JSON.stringify(friendRequestInfoDTO))
}

// 获取我发起申请的好友请求
const get_friend_request_list = async (friendRequestInfoDTO: FriendRequestInfoDTO) => {
  return await invoke_rust(HTTP_METHOD.POST, '/friend/get_friend_request_list', JSON.stringify(friendRequestInfoDTO))
}

// 获取向我发起的请求
const get_accept_friend_request_list = async (friendRequestInfoDTO: FriendRequestInfoDTO) => {
  return await invoke_rust(HTTP_METHOD.POST, '/friend/get_accept_friend_request_list', JSON.stringify(friendRequestInfoDTO))
}

export { get_friend_info, get_friend_list, sign_up, search_user_by_account, process_friend_request, get_friend_request_list, get_accept_friend_request_list };
