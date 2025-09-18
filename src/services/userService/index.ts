import { HTTP_METHOD, TALK_API } from '@/constants';
import { invoke_rust } from '@/services';
import { invoke } from '@tauri-apps/api/core';
import { FriendRequestInfoDTO } from '@/types/friend';

const get_friend_list = async () => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/get_friend',
    '',
  );
};

const get_friend_info = async (uuid: string) => {
  return await invoke(
'get_friend_info',
    {
      friendUuid: uuid,
    },
  );
};

// 发起好友申请
const add_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/add_friend',
    JSON.stringify(friend)
  );
};

// 处理好友申请
const process_friend = async (friend: FriendRequestInfoDTO) => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/process_friend',
    JSON.stringify(friend)
  );
};

export { get_friend_list, get_friend_info }