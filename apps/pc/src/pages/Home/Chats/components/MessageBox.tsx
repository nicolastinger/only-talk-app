import { MessageQueueProps } from '@workspace/types';
import { Badge } from 'antd';
import dayjs from 'dayjs';
import styles from './styles/MessageBox.less';

const MessageBox = (props: MessageQueueProps) => {
  const { message, title, time, img, count } = props;

  console.log('message', img);

  const timeStr = dayjs(time).format('HH:mm:ss');
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge count={count}>
          <img src={img || ''} className={styles.imgItem} alt="123" />
        </Badge>
      </div>
      <div className={styles.center}>
        <div className={styles.centerTitle}>
          <div className={styles.titleText}>{title}</div>
        </div>
        <div className={styles.centerText}>
          <div className={styles.msgText}>{message}</div>
        </div>
      </div>
      <div className={styles.end}>
        <div className={styles.endTime}>{timeStr}</div>
      </div>
    </div>
  );
};

export default MessageBox;
