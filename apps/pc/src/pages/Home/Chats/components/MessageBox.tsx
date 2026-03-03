import { MessageQueueProps } from '@workspace/types';
import { Badge } from 'antd';
import dayjs from 'dayjs';
import styles from './styles/MessageBox.less';
import { getFiles } from '@workspace/services';
import { useEffect, useState } from 'react';

const MessageBox = (props: MessageQueueProps) => {
  const { message, title, time, img, count } = props;

  const [friendIcon, setFriendIcon] = useState<string>('');

  useEffect(() => {
    getUserIcon(img || '').then((icon) => setFriendIcon(icon));
  }, [img]);

  // 获取用户头像
  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);

      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      console.log(error);
      return '';
    }
  };

  console.log('message', img);

  const timeStr = dayjs(time).format('HH:mm:ss');
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge count={count}>
          <img src={friendIcon || ''} className={styles.imgItem} alt="123" />
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
