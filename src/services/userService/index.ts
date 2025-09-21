import { HTTP_METHOD, TALK_API } from '@/constants';
import { invoke_rust } from '@/services';
import { FriendRequestInfoDTO } from '@/types/friend';
import { invoke } from '@tauri-apps/api/core';
import { BasicUser, UserInfo } from '@/types/user/common';

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
    TALK_API + '/friend/add_friend',
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

export { get_friend_info, get_friend_list, sign_up, search_user_by_account };
