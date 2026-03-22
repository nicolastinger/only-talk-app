import { history } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { FriendVo } from '@workspace/types';
import { Badge } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendBox.less';

const FriendBox = (props: { friend: FriendVo }) => {
  const { friend_name, friend_id, friend_icon } = props.friend;
  const [userIcon, setUserIcon] = useState<string | null>(null);

  const routeToFriendInfo = () => {
    history.push('/home/contacts/friend?friendId=' + friend_id);
    console.log('朋友账号', friend_id);
  };

  // 获取用户头像
  const getUserIcon = async (icon: string) => {
    try {
      const FileVos = await getFiles(icon);
      setUserIcon(FileVos?.[0]?.tauri_file_path || null);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getUserIcon(friend_icon);
  }, [friend_icon]);

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge>
          <img src={userIcon || ''} className={styles.imgItem} alt="123" />
        </Badge>
      </div>
      <div className={styles.center} onClick={routeToFriendInfo}>
        <div className={styles.centerTitle}>{friend_name}</div>
      </div>
    </div>
  );
};

export default FriendBox;
