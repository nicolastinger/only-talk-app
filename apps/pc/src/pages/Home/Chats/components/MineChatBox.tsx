import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  getFiles,
} from '@workspace/services';
import { ChatMessage, ImageRecord } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
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
      text_msg_raw: { raw, text_type, timestamp },
    },
    isAck = true,
    icon,
    friendUuid,
    currentBizId,
  } = props;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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
        getChatFileByBizId(bizId)
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

  return (
    <div className={styles.container}>
      <div className={styles.messageWrapper}>
        {renderAck()}
        <div className={styles.chatContainerWrapper}>
          <div className={`${styles.chatContainer} ${isImageMessage ? styles.imageMessage : ''}`}>
            {renderMessage(raw)}
          </div>
          <div className={styles.tooltip}>
            {formatFullTime(timestamp)}
          </div>
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
        />
      </div>
    </div>
  );
};

export default React.memo(MineChatBox);
