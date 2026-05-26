import { SYSTEM_ACCOUNT } from '@/constants';
import { ChatMessage, MessageFrom } from '@workspace/types';
import React from 'react';
import styles from './GroupMessageList.less';

interface GroupMessageListProps {
  messages: ChatMessage[];
  groupUuid: string;
  newMessageIds?: Set<string>;
  loadedMessageIds?: Set<string>;
}

const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_NOTIFICATION = 2004;

const TEN_MINUTES = 10 * 60 * 1000;

const formatTime = (timestamp: number) => {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const GroupMessageList: React.FC<GroupMessageListProps> = ({
  messages,
  groupUuid,
  newMessageIds,
  loadedMessageIds,
}) => {
  const getMessageAnimationClass = (nanoId: string): string => {
    if (newMessageIds?.has(nanoId)) {
      return styles.newMessageAnimation;
    }
    if (loadedMessageIds?.has(nanoId)) {
      return styles.messageItem;
    }
    return '';
  };

  return (
    <div className={styles.groupMessageList}>
      {messages.map((msg, index) => {
        const message = msg.text_msg_raw;
        if (message.text_type === 201) {
          return null;
        }

        const prevMsg = index > 0 ? messages[index - 1] : null;
        const prevTimestamp = prevMsg?.text_msg_raw.timestamp || 0;
        const currentTimestamp = message.timestamp;
        const shouldShowTimestamp =
          index === 0 ||
          Math.abs(currentTimestamp - prevTimestamp) >= TEN_MINUTES;

        const animationClass = getMessageAnimationClass(message.nano_id);
        const isMine = msg.from === MessageFrom.Mine;
        const isSystem = msg.from === MessageFrom.System || message.send_user === SYSTEM_ACCOUNT || message.text_type === MSG_TYPE_GROUP_NOTIFICATION;

        const senderName = msg.sender_name || (isMine ? '我' : '群成员');
        const senderIcon = msg.sender_icon || msg.img || '';

        let content = null;

        if (isSystem || message.text_type === MSG_TYPE_GROUP_NOTIFICATION) {
          try {
            const sysMsg = JSON.parse(message.raw);
            content = (
              <div className={styles.groupMessageSystem}>
                {sysMsg.text || sysMsg.content || message.raw}
              </div>
            );
          } catch {
            content = (
              <div className={styles.groupMessageSystem}>
                {message.raw}
              </div>
            );
          }
        } else if (message.text_type === MSG_TYPE_GROUP_TEXT) {
          try {
            const textMsg = JSON.parse(message.raw);
            content = (
              <div className={styles.groupMessageBody}>
                {textMsg.text || message.raw}
              </div>
            );
          } catch {
            content = (
              <div className={styles.groupMessageBody}>
                {message.raw}
              </div>
            );
          }
        } else if (message.text_type === MSG_TYPE_GROUP_IMAGE) {
          let imageUrl = message.raw;
          try {
            const imgData = JSON.parse(message.raw);
            imageUrl = imgData.biz_id || imgData.url || imgData.path || message.raw;
          } catch {}
          content = (
            <img
              className={styles.groupMessageImage}
              src={imageUrl}
              alt="图片"
              onClick={() => window.open(imageUrl, '_blank')}
            />
          );
        } else if (message.text_type === MSG_TYPE_GROUP_FILE) {
          let fileName = '文件';
          let fileSize = 0;
          try {
            const fileData = JSON.parse(message.raw);
            fileName = fileData.file_name || fileData.name || '文件';
            fileSize = fileData.file_size || fileData.size || 0;
          } catch {}
          content = (
            <div className={styles.groupMessageFile}>
              <span className={styles.groupMessageFileIcon}>📄</span>
              <div className={styles.groupMessageFileInfo}>
                <span className={styles.groupMessageFileName}>{fileName}</span>
                <span className={styles.groupMessageFileSize}>
                  {formatFileSize(fileSize)}
                </span>
              </div>
            </div>
          );
        }

        return (
          <React.Fragment key={message.nano_id}>
            {shouldShowTimestamp && (
              <div className={styles.timestampDivider}>
                <span className={styles.timestampText}>
                  {formatTime(currentTimestamp)}
                </span>
              </div>
            )}
            {isSystem ? (
              content
            ) : (
              <div
                className={`${styles.groupMessageItem} ${animationClass} ${
                  isMine ? styles.groupMessageItemMine : ''
                }`}
              >
                <div className={styles.groupMessageAvatar}>
                  {senderIcon ? (
                    <img src={senderIcon} alt="avatar" />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4096ff',
                        fontSize: '16px',
                      }}
                    >
                      {senderName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className={styles.groupMessageContent}>
                  <div className={styles.groupMessageHeader}>
                    <span className={styles.groupMessageSenderName}>
                      {senderName}
                    </span>
                    <span className={styles.groupMessageTimestamp}>
                      {formatTime(currentTimestamp)}
                    </span>
                  </div>
                  {content}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default React.memo(GroupMessageList, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }

  for (let i = 0; i < prevProps.messages.length; i++) {
    const prevMsg = prevProps.messages[i];
    const nextMsg = nextProps.messages[i];

    if (prevMsg.text_msg_raw.nano_id !== nextMsg.text_msg_raw.nano_id) {
      return false;
    }

    if (prevMsg.text_msg_raw.timestamp !== nextMsg.text_msg_raw.timestamp) {
      return false;
    }
  }

  if (
    prevProps.newMessageIds?.size !== nextProps.newMessageIds?.size ||
    prevProps.loadedMessageIds?.size !== nextProps.loadedMessageIds?.size
  ) {
    return false;
  }

  return true;
});