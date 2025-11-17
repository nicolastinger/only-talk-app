import { LayoutBtnProps } from '@/types/user/common';
import styles from './style/index.less';
const LayoutBtn = (props: LayoutBtnProps) => {
  const { icon, active, unreadCount } = props;

  return (
    <div className={`${styles.container} ${active ? styles.active : ''}`}>
      {icon}
      {unreadCount > 0 && (
        <div className={styles.unreadBadge}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
};

export default LayoutBtn;
