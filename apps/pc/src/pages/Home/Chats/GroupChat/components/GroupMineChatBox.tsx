import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import {
  convertPathToTauriUrl,
  getChatFileByBizId,
  getFiles,
} from '@workspace/services';
import { ChatMessage, GroupFileRecord } from '@workspace/types';
import React, { useEffect, useRef, useState } from 'react';
import ChatFile from '../../components/ChatFile';
import ChatImage from '../../components/ChatImage';
import styles from '../../components/styles/MineChatBox.less';
import { TextBox } from '../../components/TextBox';

const imageCache = new Map<string, string>();

type GroupMineChatBoxProps = {
  msg: ChatMessage;
  isAck: boolean | undefined;
  icon?: string;
  groupUuid: string;
  currentBizId?: string;
};

// 群聊消息类型
const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;

const isLocalFilePath = (raw: string): boolean => {
  return (
    raw.includes(':\\') || raw.startsWith('/') || raw.startsWith('file://')
  );
};

/**
 * 解析群聊消息的 text 字段
 * 文字消息: {"text":"消息内容","send_user":"..."}
 * 图片/文件消息: {"text":"{\"biz_id\":\"...\"}","send_user":"..."}
 */
const parseGroupMessageText = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    return parsed.text || raw;
  } catch {
    return raw;
  }
};

/**
 * 解析群聊图片消息的 bizId
 * 群聊图片消息 raw 是双层 JSON: {"text":"{...GroupImageRecord...}","send_user":"..."}
 */
const parseGroupImageBizId = (raw: string): string | null => {
  try {
    let parsed = JSON.parse(raw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed.biz_id || parsed.url || null;
  } catch (error) {
    console.error('GroupMineChatBox - Error parsing image record:', error);
    return null;
  }
};

/**
 * 解析群聊文件消息
 * 群聊文件消息 raw 是双层 JSON: {"text":"{...GroupFileRecord...}","send_user":"..."}
 */
const parseGroupFileRecord = (raw: string): GroupFileRecord | null => {
  try {
    let parsed = JSON.parse(raw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupFileRecord;
  } catch (error) {
    console.error('GroupMineChatBox - Error parsing file record:', error);
    return null;
  }
};

const GroupMineChatBox: React.FC<GroupMineChatBoxProps> = (props) => {
  const {
    msg: {
      text_msg_raw: { raw, text_type, timestamp, nano_id },
    },
    isAck = true,
    icon,
    groupUuid,
    currentBizId,
  } = props;
  const [userIcon, setUserIcon] = React.useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<GroupFileRecord | null>(null);

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

  // 处理图片消息
  useEffect(() => {
    if (text_type === MSG_TYPE_GROUP_IMAGE) {
      let bizId = currentBizId;

      // 如果没有传入 currentBizId，从 raw 解析
      if (!bizId) {
        // 本地文件路径（发送中的临时消息）
        if (isLocalFilePath(raw)) {
          const tauriUrl = convertPathToTauriUrl(raw);
          if (tauriUrl) {
            setImageUrl(tauriUrl);
          }
          return;
        }

        bizId = parseGroupImageBizId(raw);
      }

      if (!bizId) {
        console.error('GroupMineChatBox - No bizId found');
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
          console.error('GroupMineChatBox - Error loading image:', error);
          setLoading(false);
        });
    }

    // 处理文件消息
    if (text_type === MSG_TYPE_GROUP_FILE) {
      if (isLocalFilePath(raw)) {
        const fileName = raw.split(/[/\\]/).pop() || 'unknown';
        setFileRecord({
          biz_id: '',
          file_name: fileName,
          file_size: 0,
          file_type: fileName.split('.').pop() || '',
          send_user: '',
        });
        return;
      }

      const record = parseGroupFileRecord(raw);
      if (record) {
        setFileRecord(record);
      }
    }
  }, [raw, text_type, currentBizId, nano_id]);

  const renderMessage = () => {
    if (text_type === MSG_TYPE_GROUP_TEXT) {
      return TextBox(parseGroupMessageText(raw));
    }
    if (text_type === MSG_TYPE_GROUP_IMAGE) {
      return (
        <ChatImage
          src={imageUrl}
          loading={loading}
          friendUuid={groupUuid}
          currentBizId={currentBizId || ''}
          meUuid={userInfo?.uuid || ''}
        />
      );
    }
    if (text_type === MSG_TYPE_GROUP_FILE) {
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
    return TextBox(raw);
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

  const isImageMessage = text_type === MSG_TYPE_GROUP_IMAGE;
  const isFileMessage = text_type === MSG_TYPE_GROUP_FILE;

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
              ackFlag === 101 ? styles.hasSentBubble : ''
            }`}
          >
            {renderMessage()}
            {ackFlag === 101 && (
              <span className={styles.sentBadge} />
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

export default React.memo(GroupMineChatBox);