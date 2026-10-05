import { ChatMessage, MessageFrom } from '@workspace/types';
import React from 'react';
import CustomerChatBox from './CustomerChatBox';
import MessageTimestamp from './MessageTimestamp';
import MineChatBox from './MineChatBox';
import styles from './styles/MessageBox.less';

interface MessageListProps {
  messages: ChatMessage[];
  friendIcon?: string;
  friendUuid: string;
  groupMode?: boolean;
  newMessageIds?: Set<string>;
  loadedMessageIds?: Set<string>;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onMessageContext?: (msg: ChatMessage, e: React.MouseEvent) => void;
  onToggleSelect?: (msg: ChatMessage) => void;
}

const TEN_MINUTES = 10 * 60 * 1000;

const MessageList: React.FC<MessageListProps> = ({
  messages,
  friendIcon,
  friendUuid,
  groupMode,
  newMessageIds,
  loadedMessageIds,
  selectMode,
  selectedIds,
  onMessageContext,
  onToggleSelect,
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
    <>
      {messages.map((msg, index) => {
        let message = msg.text_msg_raw;
        if (message.text_type === 201) {
          return null;
        }

        const prevMsg = index > 0 ? messages[index - 1] : null;
        const prevTimestamp = prevMsg?.text_msg_raw.timestamp || 0;
        const currentTimestamp = message.timestamp;

        const shouldShowTimestamp =
          index === 0 ||
          Math.abs(currentTimestamp - prevTimestamp) >= TEN_MINUTES;

        let currentBizId = '';
        if (message.text_type === 2) {
          try {
            const imageRecord = JSON.parse(message.raw);
            currentBizId = imageRecord.biz_id;
          } catch (error) {
            console.error('Failed to parse image record:', error);
          }
        }

        const animationClass = getMessageAnimationClass(message.nano_id);
        const isMine = msg.from === MessageFrom.Mine;
        const selected = !!selectedIds?.has(message.nano_id);

        // For group mode, show sender icon/name from the message
        const displayIcon = groupMode
          ? msg.sender_icon || msg.img || friendIcon
          : friendIcon;
        const senderName = groupMode ? msg.sender_name : undefined;

        return (
          <React.Fragment key={message.nano_id}>
            {shouldShowTimestamp && (
              <MessageTimestamp timestamp={currentTimestamp} />
            )}
            <div
              className={`${animationClass} ${styles.rowWrapper} ${
                selectMode ? styles.selectRow : ''
              } ${selected ? styles.selectedRow : ''}`}
              onContextMenu={(e) => onMessageContext?.(msg, e)}
              onClickCapture={(e) => {
                if (!selectMode) return;
                e.stopPropagation();
                e.preventDefault();
                onToggleSelect?.(msg);
              }}
            >
              {selectMode && (
                <span
                  className={`${styles.selectMark} ${
                    selected ? styles.checked : ''
                  }`}
                />
              )}
              {!isMine ? (
                <CustomerChatBox
                  from={MessageFrom.System}
                  ack={undefined}
                  img={displayIcon}
                  senderName={senderName}
                  text_msg_raw={message}
                  friendUuid={friendUuid}
                  currentBizId={currentBizId}
                />
              ) : (
                <MineChatBox
                  icon={displayIcon}
                  msg={msg}
                  isAck={msg.ack}
                  friendUuid={friendUuid}
                  currentBizId={currentBizId}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

export default React.memo(MessageList, (prevProps, nextProps) => {
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

  if (
    prevProps.selectMode !== nextProps.selectMode ||
    prevProps.selectedIds !== nextProps.selectedIds ||
    prevProps.onMessageContext !== nextProps.onMessageContext ||
    prevProps.onToggleSelect !== nextProps.onToggleSelect
  ) {
    return false;
  }

  return true;
});
