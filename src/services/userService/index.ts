import { HTTP_METHOD, TALK_API } from '@/constants';
import { invoke_rust } from '@/services';
import { invoke } from '@tauri-apps/api/core';

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

export { get_friend_list, get_friend_info }