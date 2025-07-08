import { ChatMessage, MessageFrom } from '@/types/user/common';
import React from 'react';
import CustomerChatBox from './CustomerChatBox';
import  MineChatBox  from './MineChatBox';

interface MessageListProps {
  messages: ChatMessage[];
  friendIcon?: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, friendIcon }) => {
  console.log("渲染的MessageListProps", messages)
  return (
    <>
      {messages.map((message) => {
        if (message.type === 201){
          return null;
        }
        if (message.from !== MessageFrom.Mine) {
          return (
            <CustomerChatBox
              id={message.id}
              img={friendIcon}
              key={message.id}
              message={message.message}
              time={message.time}
              from={MessageFrom.Customer}
              user={message.user}
              type={message.type}
              ack={message.ack}
            />
          );
        } else {
          return <MineChatBox key={message.id} msg={message} isAck={message.ack}/>;
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

  return prevLastMessage?.id === nextLastMessage?.id;
});
