import PresenceTag from '@/components/PresenceTag';
import UserTypeTag from '@/components/UserTypeTag';
import { DEFAULT_ICON } from '@/constants';
import { usePresenceStore } from '@/store/presence';
import { history } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { FriendVo } from '@workspace/types';
import { Badge } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/FriendBox.less';

const FriendBox = (props: { friend: FriendVo; isSelected?: boolean }) => {
  const { friend_name, friend_id, friend_icon } = props.friend;
  const [userIcon, setUserIcon] = useState<string | null>(null);
  // 手动状态(忙碌/学习中/自定义等), 与在线离线无关
  const presence = usePresenceStore(
    (state) => state.friendPresence[friend_id?.toLowerCase() ?? ''],
  );

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
    <div
      className={`${styles.container} ${
        props.isSelected ? styles.selected : ''
      }`}
      onClick={routeToFriendInfo}
    >
      <div className={styles.left}>
        <Badge>
          <img
            src={userIcon || DEFAULT_ICON}
            className={styles.imgItem}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
        </Badge>
      </div>
      <div className={styles.center}>
        <div className={styles.centerTitle}>
          {friend_name}
          <UserTypeTag type={props.friend.friend_user_type} />
        </div>
        {presence && (
          <div className={styles.centerSub}>
            <PresenceTag presence={presence} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendBox;
