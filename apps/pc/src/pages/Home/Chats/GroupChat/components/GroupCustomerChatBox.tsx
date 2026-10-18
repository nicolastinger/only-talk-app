import UserTypeTag from '@/components/UserTypeTag';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { formatFullTime } from '@/utils/format';
import { openUserProfile } from '@/utils/userProfile';
import {
  getChatFileByBizId,
  getFiles,
  shouldAutoDownloadImage,
} from '@workspace/services';
import {
  ChatMessage,
  GroupFileRecord,
  GroupImageRecord,
  GroupVoiceRecord,
} from '@workspace/types';
import React, { useEffect, useState } from 'react';
import ChatFile from '../../components/ChatFile';
import ChatImage from '../../components/ChatImage';
import ChatVoice from '../../components/ChatVoice';
import styles from '../../components/styles/CustomerChatBox.less';
import { TextBox } from '../../components/TextBox';

const imageCache = new Map<string, string>();

interface GroupCustomerChatBoxProps {
  msg: ChatMessage;
  icon?: string;
  senderName?: string;
  senderUserType?: number;
  groupUuid: string;
  currentBizId?: string;
}

// 群聊消息类型
const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_VOICE = 2006;

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
 * 解析群聊图片消息
 * 群聊图片消息 raw 是双层 JSON: {"text":"{...GroupImageRecord...}","send_user":"..."}
 */
const parseGroupImageRecord = (raw: string): GroupImageRecord | null => {
  try {
    let parsed = JSON.parse(raw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupImageRecord;
  } catch (error) {
    console.error('GroupCustomerChatBox - Error parsing image record:', error);
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
    console.error('GroupCustomerChatBox - Error parsing file record:', error);
    return null;
  }
};

/**
 * 解析群聊语音消息
 * 群聊语音消息 raw 是双层 JSON: {"text":"{...GroupVoiceRecord...}","send_user":"..."}
 */
const parseGroupVoiceRecord = (raw: string): GroupVoiceRecord | null => {
  try {
    let parsed = JSON.parse(raw);
    if (parsed.text) {
      parsed = JSON.parse(parsed.text);
    }
    return parsed as GroupVoiceRecord;
  } catch (error) {
    console.error('GroupCustomerChatBox - Error parsing voice record:', error);
    return null;
  }
};

const GroupCustomerChatBox: React.FC<GroupCustomerChatBoxProps> = (props) => {
  const {
    msg: {
      text_msg_raw: { raw, text_type, timestamp, nano_id },
    },
    icon,
    senderName,
    senderUserType,
    groupUuid,
    currentBizId,
  } = props;

  const userInfo = useBearStore((state) => state.userInfo);
  const [senderIcon, setSenderIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileRecord, setFileRecord] = useState<GroupFileRecord | null>(null);
  const [voiceRecord, setVoiceRecord] = useState<GroupVoiceRecord | null>(null);
  const [imageBizId, setImageBizId] = useState<string>('');
  const [autoDownload, setAutoDownload] = useState(true);

  // 加载发送者头像
  useEffect(() => {
    if (!icon) return;

    if (imageCache.has(icon)) {
      setSenderIcon(imageCache.get(icon)!);
      return;
    }

    setLoading(true);
    getFiles(icon)
      .then((FileVos) => {
        const tauriFilePath = FileVos?.[0]?.tauri_file_path || '';
        if (tauriFilePath) {
          imageCache.set(icon, tauriFilePath);
        }
        setSenderIcon(tauriFilePath);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [icon]);

  // 处理图片消息
  useEffect(() => {
    if (text_type !== MSG_TYPE_GROUP_IMAGE) {
      // 处理文件消息
      if (text_type === MSG_TYPE_GROUP_FILE) {
        const record = parseGroupFileRecord(raw);
        if (record) {
          setFileRecord(record);
        }
      }
      if (text_type === MSG_TYPE_GROUP_VOICE) {
        const record = parseGroupVoiceRecord(raw);
        if (record) {
          setVoiceRecord(record);
        }
      }
      return;
    }

    let bizId = currentBizId;
    // 如果没有传入 currentBizId，从 raw 解析
    if (!bizId) {
      const record = parseGroupImageRecord(raw);
      bizId = record?.biz_id || undefined;
    }
    if (!bizId) {
      console.error('GroupCustomerChatBox - No bizId found');
      return;
    }

    setImageBizId(bizId);
    if (imageCache.has(bizId)) {
      setImageUrl(imageCache.get(bizId)!);
      return;
    }

    let cancelled = false;
    (async () => {
      // 非计量网络且开关开启才自动下载，否则交给 ChatImage 点击下载
      const allow = await shouldAutoDownloadImage();
      if (cancelled) return;
      setAutoDownload(allow);
      if (!allow) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const files = await getChatFileByBizId(bizId, nano_id);
        if (cancelled) return;
        const tauriFilePath = files?.[0]?.tauri_file_path;
        if (tauriFilePath) {
          imageCache.set(bizId, tauriFilePath);
          setImageUrl(tauriFilePath);
        }
      } catch (error) {
        console.error('GroupCustomerChatBox - Error loading image:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
          currentBizId={imageBizId || currentBizId || ''}
          bizId={imageBizId}
          autoDownload={autoDownload}
          meUuid={userInfo?.uuid || ''}
          isGroup={true}
          nanoId={nano_id}
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
    if (text_type === MSG_TYPE_GROUP_VOICE) {
      return (
        <ChatVoice
          bizId={voiceRecord?.biz_id}
          duration={voiceRecord?.duration || 0}
          nanoId={nano_id}
        />
      );
    }
    return TextBox(raw);
  };

  const isImageMessage = text_type === MSG_TYPE_GROUP_IMAGE;
  const isFileMessage = text_type === MSG_TYPE_GROUP_FILE;

  return (
    <div className={styles.container}>
      <div className={styles.userIcon}>
        <img
          src={senderIcon || DEFAULT_ICON}
          width={40}
          height={40}
          className={styles.imgItem}
          alt="avatar"
          style={{ opacity: loading ? 0.7 : 1 }}
          onClick={() =>
            openUserProfile(
              props.msg.sender_uuid || props.msg.text_msg_raw.send_user || '',
            )
          }
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
      </div>
      <div className={styles.chatContainerWrapper}>
        {senderName && (
          <div className={styles.senderName}>
            {senderName}
            <UserTypeTag type={senderUserType} />
          </div>
        )}
        <div
          className={`${styles.chatContainer} ${
            isImageMessage ? styles.imageMessage : ''
          } ${isFileMessage ? styles.fileMessage : ''}`}
        >
          {renderMessage()}
        </div>
        <div className={styles.tooltip}>{formatFullTime(timestamp)}</div>
      </div>
    </div>
  );
};

export default React.memo(GroupCustomerChatBox);
