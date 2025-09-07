import styles from './styles/FriendInfo.less'
import { useEffect, useState } from 'react';
import { get_friend_info } from '@/services/userService';
import { FriendVo } from '@/types/backend/vo';
import { Button } from "antd";
import { invoke } from '@tauri-apps/api/core';
import { history } from '@umijs/max';

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();

  useEffect(() => {
    console.log('uuid', uuid);
    initUserData(uuid);
  }, [uuid]);

  const initUserData = async (uuid: string) => {
    try {
      const res = (await get_friend_info(uuid)) as FriendVo;
      console.log('res', res);
      setCurrentFriend(res);
    } catch (err) {
      console.log(err);
    }
  };

  const routeToChat = async () => {
    try {
      const res = await invoke('create_chat_session', {friendUuid: uuid})
      console.log('res', res);
      history.push('/home/chats/chat?currentFriend=' + uuid)
    } catch (err) {
      console.log(err);
    }
  };

  const renderBtn = () => {
    return (
      <Button color="default" variant="solid" onClick={routeToChat}>
        发送消息
      </Button>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <img
            className={styles.icon}
            src={currentFriend?.friend_icon || ''}
            alt="icon"
          />
        </div>
        <div className={styles.body}>
          <div className={styles.name}>{currentFriend?.friend_name}</div>
        </div>
        <div className={styles.footer}>
          <div className={styles.button}>{renderBtn()}</div>
        </div>
      </div>
    </div>
  );
};

export default FriendInfo;
