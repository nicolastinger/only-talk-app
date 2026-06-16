import { SYSTEM_ACCOUNT } from '@/constants';
import { ChatMessage, MessageFrom, UserInfo } from '@workspace/types';
import React from 'react';
import GroupCustomerChatBox from './GroupCustomerChatBox';
import GroupMineChatBox from './GroupMineChatBox';
import MessageTimestamp from '../../components/MessageTimestamp';
import styles from './GroupMessageList.less';

interface GroupMessageListProps {
  messages: ChatMessage[];
  groupUuid: string;
  newMessageIds?: Set<string>;
  loadedMessageIds?: Set<string>;
  memberInfoMap: Map<string, UserInfo>;
}

const MSG_TYPE_GROUP_TEXT = 2001;
const MSG_TYPE_GROUP_IMAGE = 2002;
const MSG_TYPE_GROUP_FILE = 2003;
const MSG_TYPE_GROUP_NOTIFICATION = 2004;

const TEN_MINUTES = 10 * 60 * 1000;

const GroupMessageList: React.FC<GroupMessageListProps> = ({
  messages,
  groupUuid,
  newMessageIds,
  loadedMessageIds,
  memberInfoMap,
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

        const memberInfo = memberInfoMap.get(msg.sender_uuid || message.send_user || '');
        const senderName = memberInfo?.username || msg.sender_name || (isMine ? '我' : '群成员');
        const senderIcon = memberInfo?.icon || msg.sender_icon || msg.img || '';

        if (isSystem || message.text_type === MSG_TYPE_GROUP_NOTIFICATION) {
          let systemContent = message.raw;
          try {
            const sysMsg = JSON.parse(message.raw);
            systemContent = sysMsg.text || sysMsg.content || message.raw;
          } catch {}
          
          return (
            <React.Fragment key={message.nano_id}>
              {shouldShowTimestamp && (
                <MessageTimestamp timestamp={currentTimestamp} />
              )}
              <div className={styles.groupMessageSystem}>
                {systemContent}
              </div>
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={message.nano_id}>
            {shouldShowTimestamp && (
              <MessageTimestamp timestamp={currentTimestamp} />
            )}
            <div className={animationClass}>
              {isMine ? (
                <GroupMineChatBox
                  msg={msg}
                  isAck={msg.ack}
                  icon={senderIcon}
                  groupUuid={groupUuid}
                />
              ) : (
                <GroupCustomerChatBox
                  msg={msg}
                  icon={senderIcon}
                  senderName={senderName}
                  groupUuid={groupUuid}
                />
              )}
            </div>
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

  if (prevProps.memberInfoMap.size !== nextProps.memberInfoMap.size) {
    return false;
  }

  return true;
});