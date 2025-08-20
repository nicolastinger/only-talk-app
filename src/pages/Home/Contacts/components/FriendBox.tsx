import { FriendQueueProps } from '@/types/user/common';
import { Badge } from 'antd';
import styles from './styles/FriendBox.less';
import { FriendVo } from '@/types/backend/vo';

const FriendBox = (props: {friend: FriendVo}) => {
  const { friend_name, friend_id, friend_icon,  } = props.friend;

  const routeToFriendInfo = () => {
    console.log('朋友账号', friend_id);
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge>
          <img
            src={friend_icon || ''}
            width={100}
            height={100}
            className={styles.imgItem}
            alt="123"
          />
        </Badge>
      </div>
      <div className={styles.center} onClick={routeToFriendInfo}>
        <div className={styles.centerTitle}>{friend_name}</div>
      </div>
    </div>
  );
};

export default FriendBox;
