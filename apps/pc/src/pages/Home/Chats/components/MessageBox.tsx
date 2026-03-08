import { MessageQueueProps } from '@workspace/types';
import { Badge } from 'antd';
import dayjs from 'dayjs';
import styles from './styles/MessageBox.less';
import { getFiles } from '@workspace/services';
import { useEffect, useState, useMemo } from 'react';

// 图片缓存
const imageCache = new Map<string, string>();

const MessageBox = (props: MessageQueueProps) => {
  const { message, title, time, img, count } = props;

  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 只在 img 真正变化时重新获取图片
  useEffect(() => {
    if (!img) return;
    
    // 检查缓存
    if (imageCache.has(img)) {
      setFriendIcon(imageCache.get(img)!);
      return;
    }
    
    setLoading(true);
    getUserIcon(img).then((icon) => {
      setFriendIcon(icon);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [img]);

  // 获取用户头像
  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      // 再次检查缓存（防止并发请求）
      if (imageCache.has(icon)) {
        return imageCache.get(icon)!;
      }
      
      const FileVos = await getFiles(icon);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';
      
      // 存入缓存
      imageCache.set(icon, tauriFilePath);
      
      return tauriFilePath;
    } catch (error) {
      console.log(error);
      return '';
    }
  };

  const timeStr = dayjs(time).format('HH:mm:ss');
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <Badge count={count}>
          <img 
            src={friendIcon || ''} 
            className={styles.imgItem} 
            alt="123"
            style={{ opacity: loading ? 0.7 : 1 }}
          />
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
