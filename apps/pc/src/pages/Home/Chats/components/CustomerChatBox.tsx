import { ChatMessage } from '@workspace/types';
import React, { useEffect, useState } from 'react';
import styles from './styles/CustomerChatBox.less';
import { getFiles } from '@workspace/services';

// 图片缓存
const imageCache = new Map<string, string>();

const CustomerChatBox: React.FC<ChatMessage> = (props: ChatMessage) => {
  const {
    text_msg_raw: { raw, text_type },
    img,
  } = props;
  
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className={styles.container}>
      <div className={styles.userIcon}>
        <img
          src={
            friendIcon ||
            'https://pic3.zhimg.com/v2-f971a87263e64dc9f9cf0b35f2d48d62_b.jpg?consumer=ZHI_MENG'
          }
          width={40}
          height={40}
          className={styles.imgItem}
          alt="123"
          style={{ opacity: loading ? 0.7 : 1 }}
        />
      </div>
      <div className={styles.chatContainer}>{raw}</div>
    </div>
  );
};

export default React.memo(CustomerChatBox);
