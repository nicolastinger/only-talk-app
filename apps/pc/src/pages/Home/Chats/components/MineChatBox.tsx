import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import { openUserProfile } from '@/utils/userProfile';
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  getFiles,
} from '@workspace/services';
import { ChatMessage, FileRecord, ImageRecord, VoiceRecord } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
import ChatFile from './ChatFile';
import ChatImage from './ChatImage';
import ChatVoice from './ChatVoice';
import PrivacyModeMessage from './PrivacyModeMessage';
import styles from './styles/MineChatBox.less';
import { TextBox } from './TextBox';

const imageCache = new Map<string, string>();

type MineChatBoxProps = {
  msg: ChatMessage;
  isAck: boolean | undefined;
  icon?: string;
  friendUuid: string;
  currentBizId?: string;
  /** 该消息是否正在上传（上传期间不启动 ACK 超时） */
  uploading?: boolean;
  /** 上传进度百分比 0-100（发送中展示） */
  uploadProgress?: number;
  /** 发送阶段：reading/compressing/uploading */
  sendPhase?: string;
};

// 私聊消息类型
const MSG_TYPE_TEXT = 1;
const MSG_TYPE_IMAGE = 2;
const MSG_TYPE_FILE = 3;
const MSG_TYPE_VOICE = 21;
const MSG_TYPE_PRIVACY = 4;

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
    friendUuid,
  } = props;
  const sending = isAck === false;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBizId, setImageBizId] = useState<string>('');
  const [fileRecord, setFileRecord] = useState<FileRecord | null>(null);
  const [voiceRecord, setVoiceRecord] = useState<VoiceRecord | null>(null);
  const [voiceLocalPath, setVoiceLocalPath] = useState<string>('');

  const userInfo = useBearStore((state) => state.userInfo);
  const [ackFlag, setAckFlag] = React.useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // 文件/图片上传期间不计入 ACK 超时：上传完成后(不再 uploading)才开始计时，
    // 避免大文件上传耗时被误判为发送失败。
    if (isAck !== undefined && !isAck && !props.uploading) {
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
  }, [isAck, props.uploading]);

  const getUserIcon = async (iconBizId: string) => {
    try {
      if (imageCache.has(iconBizId)) {
        setUserIcon(imageCache.get(iconBizId)!);
        return;
      }

      setLoading(true);
      const FileVos = await getFiles(iconBizId);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

      if (tauriFilePath) {
        imageCache.set(iconBizId, tauriFilePath);
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

  // 处理图片消息（私聊：单层 JSON）
  useEffect(() => {
    if (text_type === MSG_TYPE_IMAGE) {
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

        if (!bizId) {
          console.error('MineChatBox - No bizId found');
          return;
        }

        setImageBizId(bizId);

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
            console.error('MineChatBox - Error loading image:', error);
            setLoading(false);
          });
      } catch (error) {
        console.error('MineChatBox - Error parsing image record:', error);
      }
    }

    // 处理文件消息（私聊：单层 JSON）
    if (text_type === MSG_TYPE_FILE) {
      if (isLocalFilePath(raw)) {
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

    // 处理语音消息（私聊：单层 JSON，发送中为本地路径）
    if (text_type === MSG_TYPE_VOICE) {
      if (isLocalFilePath(raw)) {
        setVoiceLocalPath(raw);
        return;
      }
      try {
        const record: VoiceRecord = JSON.parse(raw);
        setVoiceRecord(record);
      } catch (error) {
        console.error('MineChatBox - Error parsing voice record:', error);
      }
    }
  }, [raw, text_type, nano_id]);

  const renderMessage = () => {
    if (text_type === MSG_TYPE_TEXT) {
      return TextBox(raw);
    }
    if (text_type === MSG_TYPE_IMAGE) {
      return (
        <ChatImage
          src={imageUrl}
          loading={loading}
          friendUuid={friendUuid}
          currentBizId={imageBizId}
          bizId={imageBizId}
          autoDownload={true}
          sending={sending}
          uploadProgress={props.uploadProgress}
          sendPhase={props.sendPhase}
          meUuid={userInfo?.uuid || ''}
          nanoId={nano_id}
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
            sending={sending}
            uploadProgress={props.uploadProgress}
            sendPhase={props.sendPhase}
          />
        );
      }
      return <div className={styles.container}>[文件]</div>;
    }
    if (text_type === MSG_TYPE_VOICE) {
      return (
        <ChatVoice
          bizId={voiceRecord?.biz_id}
          duration={voiceRecord?.duration || 0}
          localPath={voiceLocalPath}
          nanoId={nano_id}
          sending={sending}
          uploadProgress={props.uploadProgress}
          sendPhase={props.sendPhase}
        />
      );
    }
    switch (text_type) {
      case MSG_TYPE_PRIVACY:
        return <PrivacyModeMessage isMine={true} />;
      default:
        return TextBox(raw);
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

  const isImageMessage = text_type === MSG_TYPE_IMAGE;
  const isFileMessage = text_type === MSG_TYPE_FILE;
  const isSpecialMessage = [MSG_TYPE_PRIVACY].includes(text_type);

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
            {renderMessage()}
            {ackFlag === 101 && <span className={styles.sentBadge} />}
          </div>
          {ackFlag === 101 && <span className={styles.sentLabel}>已发送</span>}
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
          onClick={() => openUserProfile(userInfo?.uuid || '')}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(MineChatBox);
