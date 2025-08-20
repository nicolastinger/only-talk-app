import styles from './styles/FriendList.less';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FriendVo } from '@/types/backend/vo';
import FriendBox from '@/pages/Home/Contacts/components/FriendBox';

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
    }catch (error) {
      console.error(error);
    }
  }
  return (
    <div className={styles.container}>
      {friends.length > 0 ? (
        friends.map((friend) => (
          <div key={friend.friend_id}>
            <FriendBox key={friend.friend_id } friend={friend}></FriendBox>
          </div>
        ))
      ): null}
    </div>
  );
};

export default FriendList;