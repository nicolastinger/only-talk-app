import { ChatMessage, MessageFrom } from '@/types/user/common';
import React from 'react';
import CustomerChatBox from './CustomerChatBox';
import  MineChatBox  from './MineChatBox';

interface MessageListProps {
  messages: ChatMessage[];
  friendIcon?: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, friendIcon }) => {

  return (
    <>
      {messages.map((msg) => {
        let message = msg.text_msg_raw;
        if (message.text_type === 201){
          return null;
        }
        if (msg.from !== MessageFrom.Mine) {
          return (
            <CustomerChatBox
              key={message.nano_id}
              from={MessageFrom.System}
              ack={undefined}
              img={friendIcon}
              text_msg_raw={message}
            />
          );
        } else {
          return <MineChatBox key={message.nano_id} msg={msg} isAck={msg.ack}/>;
        }
      })}
    </>
  );
};

export default React.memo(MessageList, (prevProps, nextProps) => {
  // 只有当消息列表长度改变或最后一条消息改变时才重新渲染
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  const nextLastMessage = nextProps.messages[nextProps.messages.length - 1];
  const prevLastMessage = prevProps.messages[prevProps.messages.length - 1];

  return prevLastMessage?.text_msg_raw.nano_id === nextLastMessage?.text_msg_raw.nano_id;
});
