import { HTTP_METHOD, TALK_API } from '@/constants';
import { invoke_rust } from '@/services';

const get_friend_list = async () => {
  return await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + '/friend/get_friend',
    '',
  );
};

export { get_friend_list }