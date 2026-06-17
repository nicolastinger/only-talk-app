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
  senderName?: string;
}

// 私聊消息类型
const MSG_TYPE_TEXT = 1;
const MSG_TYPE_IMAGE = 2;
const MSG_TYPE_FILE = 3;
const MSG_TYPE_PRIVACY = 4;

const CustomerChatBox: React.FC<CustomerChatBoxProps> = (
  props: CustomerChatBoxProps,
) => {
  const {
    text_msg_raw: { raw, text_type, timestamp, nano_id },
    img,
    friendUuid,
    senderName,
  } = props;

  const userInfo = useBearStore((state) => state.userInfo);
  const [friendIcon, setFriendIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<FileRecord | null>(null);

  // 加载好友头像
  useEffect(() => {
    if (!img) return;

    if (imageCache.has(img)) {
      setFriendIcon(imageCache.get(img)!);
      return;
    }

    setLoading(true);
    getFiles(img)
      .then((FileVos) => {
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';
        if (tauriFilePath) {
          imageCache.set(img, tauriFilePath);
        }
        setFriendIcon(tauriFilePath);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [img]);

  // 处理图片消息（私聊：单层 JSON）
  useEffect(() => {
    if (text_type === MSG_TYPE_IMAGE) {
      try {
        const imageRecord: ImageRecord = JSON.parse(raw);
        const bizId = imageRecord.biz_id;

        if (!bizId) {
          console.error('CustomerChatBox - No bizId found');
          return;
        }

        if (imageCache.has(bizId)) {
          setImageUrl(imageCache.get(bizId)!);
          return;
        }

        setLoading(true);
        getChatFileByBizId(bizId, nano_id)
          .then((files) => {
            if (files && files.length > 0) {
              const tauriFilePath = files[0].tauri_file_path;
              if (tauriFilePath) {
                imageCache.set(bizId, tauriFilePath);
                setImageUrl(tauriFilePath);
              }
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

    // 处理文件消息（私聊：单层 JSON）
    if (text_type === MSG_TYPE_FILE) {
      try {
        const record: FileRecord = JSON.parse(raw);
        setFileRecord(record);
      } catch (error) {
        console.error('CustomerChatBox - Error parsing file record:', error);
      }
    }
  }, [raw, text_type, nano_id]);

  const renderMessage = () => {
    if (text_type === MSG_TYPE_TEXT) {
      return TextBox(raw);
    }
    if (text_type === MSG_TYPE_IMAGE) {
      const bizId = fileRecord?.biz_id || '';
      return (
        <ChatImage
          src={imageUrl}
          loading={loading}
          friendUuid={friendUuid}
          currentBizId={bizId}
          meUuid={userInfo?.uuid || ''}
        />
      );
    }
    if (text_type === MSG_TYPE_FILE) {
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
        return TextBox(raw);
    }
  };

  const isImageMessage = text_type === MSG_TYPE_IMAGE;
  const isFileMessage = text_type === MSG_TYPE_FILE;
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
          {renderMessage()}
        </div>
        <div className={styles.tooltip}>{formatFullTime(timestamp)}</div>
      </div>
    </div>
  );
};

export default React.memo(CustomerChatBox);