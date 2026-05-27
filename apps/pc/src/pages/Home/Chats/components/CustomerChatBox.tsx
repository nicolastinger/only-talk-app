import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import { getChatFileByBizId, getFiles } from '@workspace/services';
import { ChatMessage, FileRecord, ImageRecord } from '@workspace/types';
import React, { useEffect, useState } from 'react';
import ChatFile from './ChatFile';
import ChatImage from './ChatImage';
import PrivacyModeMessage from './PrivacyModeMessage';
import styles from './styles/CustomerChatBox.less';
import { TextBox } from './TextBox';
import WebRTCMessage from './WebRTCMessage';

const imageCache = new Map<string, string>();

interface CustomerChatBoxProps extends ChatMessage {
  friendUuid: string;
  currentBizId?: string;
  senderName?: string;
}

const MSG_TYPE_TEXT = 1;
const MSG_TYPE_IMAGE = 2;
const MSG_TYPE_FILE = 3;
const MSG_TYPE_PRIVACY = 4;
const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;

const isTextType = (text_type: number) => 
  text_type === MSG_TYPE_TEXT || text_type === MSG_TYPE_GROUP_TEXT;

const isImageType = (text_type: number) => 
  text_type === MSG_TYPE_IMAGE || text_type === MSG_TYPE_GROUP_IMAGE;

const isFileType = (text_type: number) => 
  text_type === MSG_TYPE_FILE || text_type === MSG_TYPE_GROUP_FILE;

const CustomerChatBox: React.FC<CustomerChatBoxProps> = (
  props: CustomerChatBoxProps,
) => {
  const {
    text_msg_raw: { raw, text_type, timestamp, nano_id, send_user },
    img,
    friendUuid,
    currentBizId,
    senderName,
  } = props;

  const userInfo = useBearStore((state) => state.userInfo);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<FileRecord | null>(null);

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
    if (isImageType(text_type)) {
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
        getChatFileByBizId(bizId, nano_id)
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

    // 处理文件消息
    if (isFileType(text_type)) {
      try {
        const record: FileRecord = JSON.parse(raw);
        setFileRecord(record);
      } catch (error) {
        console.error('CustomerChatBox - Error parsing file record:', error);
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
    if (isTextType(text_type)) {
      return TextBox(message);
    }
    if (isImageType(text_type)) {
      return (
        <ChatImage
          src={imageUrl}
          loading={loading}
          friendUuid={friendUuid}
          currentBizId={currentBizId || ''}
          meUuid={userInfo?.uuid || ''}
        />
      );
    }
    if (isFileType(text_type)) {
      if (fileRecord) {
        return (
          <ChatFile
            bizId={fileRecord.biz_id}
            fileName={fileRecord.file_name}
            fileSize={fileRecord.file_size}
            fileType={fileRecord.file_type}
            nanoId={nano_id}
            loading={loading}
          />
        );
      }
      return <div className={styles.container}>[文件]</div>;
    }
    switch (text_type) {
      case MSG_TYPE_PRIVACY:
        return <PrivacyModeMessage isMine={false} />;
      case 5:
      case 12:
      case 13:
      case 14:
      case 15:
      case 100:
        return <WebRTCMessage textType={text_type} isMine={false} />;
      default:
        return TextBox(message);
    }
  };

  const isImageMessage = isImageType(text_type);
  const isFileMessage = isFileType(text_type);
  const isSpecialMessage = [MSG_TYPE_PRIVACY, 5, 12, 13, 14, 15, 100].includes(text_type);

  return (
    <div className={styles.container}>
      <div className={styles.userIcon}>
        <img
          src={friendIcon || DEFAULT_ICON}
          width={40}
          height={40}
          className={styles.imgItem}
          alt="avatar"
          style={{ opacity: loading ? 0.7 : 1 }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
      </div>
      <div className={styles.chatContainerWrapper}>
        {senderName && (
          <div className={styles.senderName}>{senderName}</div>
        )}
        <div
          className={`${styles.chatContainer} ${
            isImageMessage ? styles.imageMessage : ''
          } ${isFileMessage ? styles.fileMessage : ''} ${
            isSpecialMessage ? styles.specialMessage : ''
          }`}
        >
          {renderMessage(raw)}
        </div>
        <div className={styles.tooltip}>{formatFullTime(timestamp)}</div>
      </div>
    </div>
  );
};

export default React.memo(CustomerChatBox);
