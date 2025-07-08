import { FriendQueueProps } from '@/types/user/common';
import { Badge } from 'antd';
import styles from './styles/FriendBox.less';

const FriendBox = (props: FriendQueueProps) => {
  const { title, img, account } = props;

  const routeToFriendInfo = () => {
    console.log('朋友账号', account);
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge>
          <img
            src={img || ''}
            width={100}
            height={100}
            className={styles.imgItem}
            alt="123"
          />
        </Badge>
      </div>
      <div className={styles.center} onClick={routeToFriendInfo}>
        <div className={styles.centerTitle}>{title}</div>
      </div>
    </div>
  );
};

export default FriendBox;
