import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { history } from '@umijs/max';
import { get_friend_info, getFiles } from '@workspace/services';
import { FriendVo } from '@workspace/types';
import { Button, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendInfo.less';

const FriendInfo = (props: { uuid: string }) => {
  const { uuid } = props;
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [friendIcon, setFriendIcon] = useState<string>('');

  useEffect(() => {
    console.log('uuid', uuid);
    initUserData(uuid);
  }, [uuid]);

  const initUserData = async (uuid: string) => {
    try {
      const res = (await get_friend_info(uuid)) as FriendVo;
      console.log('res', res);
      setCurrentFriend(res);
      // 获取用户头像
      const icon = await getUserIcon(res.friend_icon || '');
      setFriendIcon(icon);
    } catch (err) {
      console.log(err);
    }
  };

  // 获取用户头像
  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);

      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      message.error('获取用户头像时出现错误');

      console.log(error);
      return '';
    }
  };

  const routeToChat = async () => {
    try {
      const res = await invoke('create_chat_session', { friendUuid: uuid });
      console.log('res', res);
      history.push('/home/chats/chat?currentFriend=' + uuid);
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
          <img className={styles.icon} src={friendIcon || DEFAULT_ICON} alt="avatar" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_ICON; }} />
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
