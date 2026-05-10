import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  getFiles,
} from '@workspace/services';
import { ChatMessage, FileRecord, ImageRecord } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
import ChatFile from './ChatFile';
import ChatImage from './ChatImage';
import PrivacyModeMessage from './PrivacyModeMessage';
import styles from './styles/MineChatBox.less';
import { TextBox } from './TextBox';
import WebRTCMessage from './WebRTCMessage';

const imageCache = new Map<string, string>();

type MineChatBoxProps = {
  msg: ChatMessage;
  isAck: boolean | undefined;
  icon?: string;
  friendUuid: string;
  currentBizId?: string;
};

const isLocalFilePath = (raw: string): boolean => {
  return (
    raw.includes(':\\') || raw.startsWith('/') || raw.startsWith('file://')
  );
};

const MineChatBox: React.FC<MineChatBoxProps> = (props: MineChatBoxProps) => {
  const {
    msg: {
      text_msg_raw: { raw, text_type, timestamp, nano_id },
    },
    isAck = true,
    icon,
    friendUuid,
    currentBizId,
  } = props;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<FileRecord | null>(null);

  const userInfo = useBearStore((state) => state.userInfo);
  const [ackFlag, setAckFlag] = React.useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isAck !== undefined && !isAck) {
      timerRef.current = setTimeout(() => {
        setAckFlag(1);
      }, 10000);
    } else if (isAck !== undefined && isAck) {
      setAckFlag(101);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAck]);

  const getUserIcon = async (icon: string) => {
    try {
      if (imageCache.has(icon)) {
        setUserIcon(imageCache.get(icon)!);
        return;
      }

      setLoading(true);
      const FileVos = await getFiles(icon);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

      if (tauriFilePath) {
        imageCache.set(icon, tauriFilePath);
      }

      setUserIcon(tauriFilePath);
      setLoading(false);
    } catch (error) {
      console.log(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo?.icon) {
      getUserIcon(userInfo.icon);
    }
  }, [userInfo?.icon]);

  useEffect(() => {
    if (text_type === 2) {
      if (isLocalFilePath(raw)) {
        const tauriUrl = convertPathToTauriUrl(raw);
        if (tauriUrl) {
          setImageUrl(tauriUrl);
        }
        return;
      }

      try {
        const imageRecord: ImageRecord = JSON.parse(raw);
        const bizId = imageRecord.biz_id;
        console.log('MineChatBox - Loading image with bizId:', bizId);

        if (imageCache.has(bizId)) {
          console.log('MineChatBox - Image found in cache');
          setImageUrl(imageCache.get(bizId)!);
          return;
        }

        setLoading(true);
        getChatFileByBizId(bizId, nano_id)
          .then((files) => {
            console.log('MineChatBox - Files returned:', files);
            if (files && files.length > 0) {
              const tauriFilePath = files[0].tauri_file_path;
              console.log('MineChatBox - Tauri file path:', tauriFilePath);
              if (tauriFilePath) {
                imageCache.set(bizId, tauriFilePath);
                setImageUrl(tauriFilePath);
              } else {
                console.error('MineChatBox - Tauri file path is empty');
              }
            } else {
              console.error('MineChatBox - No files returned');
            }
            setLoading(false);
          })
          .catch((error) => {
            console.error('MineChatBox - Error loading image:', error);
            setLoading(false);
          });
      } catch (error) {
        console.error('MineChatBox - Error parsing image record:', error);
      }
    }

    // 处理文件消息
    if (text_type === 3) {
      if (isLocalFilePath(raw)) {
        // 本地文件路径，显示临时信息
        const fileName = raw.split(/[/\\]/).pop() || 'unknown';
        setFileRecord({
          prev_id: '',
          biz_id: '',
          file_name: fileName,
          file_size: 0,
          file_type: fileName.split('.').pop() || '',
          platform: 0,
        });
        return;
      }

      try {
        const record: FileRecord = JSON.parse(raw);
        setFileRecord(record);
      } catch (error) {
        console.error('MineChatBox - Error parsing file record:', error);
      }
    }
  }, [raw, text_type]);

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
      case 3:
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
      case 4:
        return <PrivacyModeMessage isMine={true} />;
      case 5:
      case 12:
      case 13:
      case 14:
      case 15:
      case 100:
        return <WebRTCMessage textType={text_type} isMine={true} />;
      default:
        return TextBox(message);
    }
  };

  const renderAck = () => {
    if (ackFlag === 1) {
      return (
        <div className={styles.ackStatus}>
          <div className={styles.ackError}>
            <span className={styles.ackIcon}>!</span>
            <span>发送失败</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const isImageMessage = text_type === 2;
  const isFileMessage = text_type === 3;
  const isSpecialMessage = [4, 5, 12, 13, 14, 15, 100].includes(text_type);

  return (
    <div className={styles.container}>
      <div className={styles.messageWrapper}>
        {renderAck()}
        <div
          className={`${styles.chatContainerWrapper} ${
            ackFlag === 101 ? styles.hasSent : ''
          }`}
        >
          <div
            className={`${styles.chatContainer} ${
              isImageMessage ? styles.imageMessage : ''
            } ${isFileMessage ? styles.fileMessage : ''} ${
              isSpecialMessage ? styles.specialMessage : ''
            } ${ackFlag === 101 ? styles.hasSentBubble : ''}`}
          >
            {renderMessage(raw)}
            {ackFlag === 101 && (
              <span className={styles.sentBadge}>
                <svg
                  width="10"
                  height="8"
                  viewBox="0 0 10 8"
                  fill="none"
                >
                  <path
                    d="M1 4L3.5 6.5L9 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </div>
          {ackFlag === 101 && (
            <span className={styles.sentLabel}>已发送</span>
          )}
          <div className={styles.tooltip}>{formatFullTime(timestamp)}</div>
        </div>
      </div>
      <div className={styles.userIcon}>
        <img
          src={userIcon || DEFAULT_ICON}
          width={40}
          height={40}
          className={styles.imgItem}
          alt="icon"
          style={{ opacity: loading ? 0.7 : 1 }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(MineChatBox);
