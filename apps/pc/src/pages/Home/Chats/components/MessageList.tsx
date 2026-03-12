import { ChatMessage, MessageFrom } from '@workspace/types';
import React from 'react';
import CustomerChatBox from './CustomerChatBox';
import MineChatBox from './MineChatBox';
import MessageTimestamp from './MessageTimestamp';

interface MessageListProps {
  messages: ChatMessage[];
  friendIcon?: string;
}

const TEN_MINUTES = 10 * 60 * 1000;

const MessageList: React.FC<MessageListProps> = ({ messages, friendIcon }) => {
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

        return (
          <React.Fragment key={message.nano_id}>
            {shouldShowTimestamp && <MessageTimestamp timestamp={currentTimestamp} />}
            {msg.from !== MessageFrom.Mine ? (
              <CustomerChatBox
                from={MessageFrom.System}
                ack={undefined}
                img={friendIcon}
                text_msg_raw={message}
              />
            ) : (
              <MineChatBox icon={friendIcon} msg={msg} isAck={msg.ack} />
            )}
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
  
  return true;
});
