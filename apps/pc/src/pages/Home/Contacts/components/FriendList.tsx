import FriendBox from '@/pages/Home/Contacts/components/FriendBox';
import { FriendVo } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import styles from './styles/FriendList.less';

const FriendList = () => {
  const [friends, setFriends] = useState<FriendVo[]>([]);
  useEffect(() => {
    getFriendList();
  }, []);

  // 获取朋友列表
  const getFriendList = async () => {
    try {
      const friendQueue: FriendVo[] = await invoke('get_friend_list');
      console.log('朋友列表', friendQueue);
      setFriends(friendQueue);
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div className={styles.container}>
      {friends.length > 0
        ? friends.map((friend) => (
            <div key={friend.friend_id}>
              <FriendBox key={friend.friend_id} friend={friend}></FriendBox>
            </div>
          ))
        : null}
    </div>
  );
};

export default FriendList;
