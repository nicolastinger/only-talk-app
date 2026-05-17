import { DEFAULT_ICON } from '@/constants';
import { formatMessageTime } from '@/utils/format';
import { getFiles } from '@workspace/services';
import { MessageQueueProps } from '@workspace/types';
import { Badge } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import styles from './styles/MessageBox.less';

// 图片缓存
const imageCache = new Map<string, string>();

const MessageBox = (props: MessageQueueProps & { isSelected?: boolean }) => {
  const {
    message,
    title,
    time,
    img,
    count,
    text_type,
    send_user,
    recv_user,
    isSelected,
  } = props;

  // 判断是否是自己给自己的会话
  const isSelfChat = send_user && recv_user && send_user === recv_user;

  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const displayMessage = useMemo(() => {
    if (text_type === 2) {
      return '[图片]';
    }

    if (text_type === 3) {
      return '[文件]';
    }

    if (text_type === 4) {
      return '[隐私模式]';
    }

    if (text_type === 5) {
      return '[视频通话]';
    }

    if (text_type === 12) {
      return '[视频通话邀请]';
    }

    if (text_type === 13) {
      return '[已接听]';
    }

    if (text_type === 14) {
      return '[已拒绝]';
    }

    if (text_type === 15) {
      return '[通话结束]';
    }

    if (text_type === 100) {
      return '[WebRTC信令]';
    }

    try {
      console.log('MessageBox message:', message);
      const parsed = JSON.parse(message);
      if (parsed.text) {
        return parsed.text;
      }
    } catch (e) {
      console.error('Failed to parse message:', e);
    }

    return message;
  }, [message, text_type]);

  // 只在 img 真正变化时重新获取图片
  useEffect(() => {
    if (!img) return;

    // 检查缓存
    if (imageCache.has(img)) {
      setFriendIcon(imageCache.get(img)!);
      return;
    }

    setLoading(true);
    getUserIcon(img)
      .then((icon) => {
        setFriendIcon(icon);
        setLoading(false);
      })
      .catch(() => {
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

  const timeStr = formatMessageTime(time);
  return (
    <div className={`${styles.container} ${isSelected ? styles.selected : ''}`}>
      <div className={styles.left}>
        <Badge count={count}>
          <img
            src={friendIcon || DEFAULT_ICON}
            className={styles.imgItem}
            alt="avatar"
            style={{ opacity: loading ? 0.7 : 1 }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
        </Badge>
      </div>
      <div className={styles.center}>
        <div className={styles.centerTitle}>
          <div className={styles.titleText}>
            <div className={styles.title}>
              {title}
              {isSelfChat && (
                <span className={styles.selfChatBadge}>📝 笔记</span>
              )}
            </div>
            <div className={styles.end}>
              <div className={styles.endTime}>{timeStr}</div>
            </div>
          </div>
        </div>
        <div className={styles.centerText}>
          <div className={styles.msgText}>{displayMessage}</div>
        </div>
      </div>
    </div>
  );
};

export default MessageBox;
