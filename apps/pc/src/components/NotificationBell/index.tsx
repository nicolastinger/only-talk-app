import { BellOutlined } from '@ant-design/icons';
import { Badge } from 'antd';
import styles from './index.less';

interface NotificationBellProps {
  count?: number;
  onClick?: () => void;
  title?: string;
}

/**
 * 页面头部"本页通知"入口按钮(带未读角标)。
 * 统一 PC 各页面(Contacts/Plaza/Moments)的通知铃铛样式。
 */
const NotificationBell = ({
  count = 0,
  onClick,
  title,
}: NotificationBellProps) => {
  return (
    <div
      className={styles.notifyBtn}
      onClick={onClick}
      title={title || '本页通知'}
    >
      <Badge count={count > 99 ? '99+' : count} overflowCount={99} size="small">
        <BellOutlined />
      </Badge>
    </div>
  );
};

export default NotificationBell;
