import FriendBox from '@/pages/Home/Contacts/components/FriendBox';
import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { FriendVo } from '@workspace/types';
import { useEffect, useState } from 'react';
import styles from './styles/FriendList.less';

const FriendList = () => {
  const [friends, setFriends] = useState<FriendVo[]>([]);
  const refreshFlag = useBearStore((state) => state.refreshFlag);
  
  useEffect(() => {
    getFriendList();
  }, []);

  useEffect(() => {
    if (refreshFlag > 0) {
      getFriendList();
    }
  }, [refreshFlag]);

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
