/**
 * 消息列表：渲染隐私聊天气泡（含空态）
 */
import { useIntl } from '@umijs/max';
import React from 'react';

import { ChatMessageItem } from '../hooks/usePrivacyChat';
import styles from '../index.less';

interface MessageListProps {
  messages: ChatMessageItem[];
  myName: string;
  friendName: string;
  messageContainerRef: React.RefObject<HTMLDivElement>;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const MessageList: React.FC<MessageListProps> = ({
  messages,
  myName,
  friendName,
  messageContainerRef,
}) => {
  const intl = useIntl();

  const renderMessage = (msg: ChatMessageItem) => {
    const meText = intl.formatMessage({ id: 'privacyChat.me' });
    const otherText = intl.formatMessage({ id: 'privacyChat.other' });
    const displayName = msg.isMine
      ? `${msg.senderName || myName}(${meText})`
      : msg.senderName || friendName;

    return (
      <div key={msg.id} className={styles.messageRow}>
        <div className={styles.messageItem}>
          <div className={styles.messageHeader}>
            <span className={styles.senderName}>{displayName}</span>
            <span className={styles.messageTime}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
          <div
            className={`${styles.messageBubble} ${
              msg.isMine ? styles.mineBubble : styles.friendBubble
            }`}
          >
            {msg.text}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={messageContainerRef} className={styles.messageContainer}>
      {messages.length === 0 ? (
        <div className={styles.emptyMessage}>
          <span>{intl.formatMessage({ id: 'privacyChat.noMessages' })}</span>
        </div>
      ) : (
        messages.map(renderMessage)
      )}
    </div>
  );
};

export default MessageList;
