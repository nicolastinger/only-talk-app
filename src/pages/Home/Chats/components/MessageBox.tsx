import { MessageQueueProps } from '@/types/user/common';
import { Badge } from 'antd';
import dayjs from 'dayjs';
import styles from './styles/MessageBox.less';

const MessageBox = (props: MessageQueueProps) => {
  const { message, title, time, img } = props;

  const timeStr = dayjs(time).format('HH:mm:ss');
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge count={5}>
          <img src={img || ''} className={styles.imgItem} alt="123" />
        </Badge>
      </div>
      <div className={styles.center}>
        <div className={styles.centerTitle}>{title}</div>
        <div className={styles.centerText}>{message}</div>
      </div>
      <div className={styles.end}>
        <div className={styles.endTime}>{timeStr}</div>
      </div>
    </div>
  );
};

export default MessageBox;
