import { useBearStore } from '@/store/store';
import { getChatFileByBizId, getFiles } from '@workspace/services';
import { ChatMessage, ImageRecord } from '@workspace/types';
import React, { useEffect, useState } from 'react';
import ChatImage from './ChatImage';
import styles from './styles/CustomerChatBox.less';
import { TextBox } from './TextBox';

const imageCache = new Map<string, string>();

interface CustomerChatBoxProps extends ChatMessage {
  friendUuid: string;
  currentBizId?: string;
}

const CustomerChatBox: React.FC<CustomerChatBoxProps> = (
  props: CustomerChatBoxProps,
) => {
  const {
    text_msg_raw: { raw, text_type },
    img,
    friendUuid,
    currentBizId,
  } = props;

  const userInfo = useBearStore((state) => state.userInfo);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!img) return;

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

  useEffect(() => {
    if (text_type === 2) {
      try {
        const imageRecord: ImageRecord = JSON.parse(raw);
        const bizId = imageRecord.biz_id;
        console.log('CustomerChatBox - Loading image with bizId:', bizId);

        if (imageCache.has(bizId)) {
          console.log('CustomerChatBox - Image found in cache');
          setImageUrl(imageCache.get(bizId)!);
          return;
        }

        setLoading(true);
        getChatFileByBizId(bizId)
          .then((files) => {
            console.log('CustomerChatBox - Files returned:', files);
            if (files && files.length > 0) {
              const tauriFilePath = files[0].tauri_file_path;
              console.log('CustomerChatBox - Tauri file path:', tauriFilePath);
              if (tauriFilePath) {
                imageCache.set(bizId, tauriFilePath);
                setImageUrl(tauriFilePath);
              } else {
                console.error('CustomerChatBox - Tauri file path is empty');
              }
            } else {
              console.error('CustomerChatBox - No files returned');
            }
            setLoading(false);
          })
          .catch((error) => {
            console.error('CustomerChatBox - Error loading image:', error);
            setLoading(false);
          });
      } catch (error) {
        console.error('CustomerChatBox - Error parsing image record:', error);
      }
    }
  }, [raw, text_type]);

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      if (imageCache.has(icon)) {
        return imageCache.get(icon)!;
      }

      const FileVos = await getFiles(icon);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';

      imageCache.set(icon, tauriFilePath);

      return tauriFilePath;
    } catch (error) {
      console.log(error);
      return '';
    }
  };

  const renderMessage = (message: string) => {
    switch (text_type) {
      case 1:
        return TextBox(message);
      case 2:
        return (
          <ChatImage
            src={imageUrl}
            loading={loading}
            friendUuid={friendUuid}
            currentBizId={currentBizId || ''}
            meUuid={userInfo?.uuid || ''}
          />
        );
      default:
        return TextBox(message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.userIcon}>
        <img
          src={friendIcon}
          width={40}
          height={40}
          className={styles.imgItem}
          alt="123"
          style={{ opacity: loading ? 0.7 : 1 }}
        />
      </div>
      <div className={styles.chatContainer}>{renderMessage(raw)}</div>
    </div>
  );
};

export default React.memo(CustomerChatBox);
