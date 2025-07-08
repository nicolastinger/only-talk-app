import Message from '@/pages/Home/Chats/components/MessageBox';
import { get_friend_list } from '@/services/userService';
import { ResponseData } from '@/types/backend/httpRust';
import { FriendInfo } from '@/types/user/common';
import { invoke } from '@tauri-apps/api/core';
import { history, Outlet } from '@umijs/max';
import React, { useEffect } from 'react';
import styles from './index.less';

const ChatsLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const [friendInfoList, setFriendInfoList] = React.useState<FriendInfo[]>([]);
  const routeToChat = (uuid: string) => {
    history.push('/home/chats/chat?currentFriend=' + uuid);
  };

  useEffect(() => {
    get_friend();
  }, []);

  // TODO 改为本地数据库实现
  const get_friend = async () => {
    console.log('get_friend_list');
    const response = await get_friend_list();

    if (response.isSuccess) {
      if (response.res.status === 200) {
        const data: ResponseData = JSON.parse(response.res.body);
        if (data != null) {
          setFriendInfoList([...data.data]);
        }
      } else {
        console.log('error', response);
      }
    }
  };

  const setCurrentFriend = async (friendInfo: FriendInfo) => {
    try {
      routeToChat(friendInfo.uuid);
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>消息列表</div>
        <div className={styles.item} key="chat">
          {friendInfoList.map((item: FriendInfo) => {
            return (
              <div key={item.uuid} onClick={() => setCurrentFriend(item)}>
                <Message
                  message={'已经卖光了'}
                  img={item.icon}
                  key={item.uuid}
                  time={1743666273032}
                  title={item.username}
                  count={0}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.right}>
        <Outlet />
      </div>
    </div>
  );
};

export default ChatsLayout;
