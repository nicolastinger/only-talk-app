import { SYSTEM_ACCOUNT, TALK_API } from '@/constants';
import useMessageApi from '@/hooks/useMessageApi';
import { HttpResponse, ResponseData } from '@/types/backend/httpRust';
import { ChatMessage, FriendInfo, MessageFrom, TextMsgRaw } from '@/types/user/common';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import ChatFooter from '../components/Footer';
import MessageList from '../components/MessageList';
import ChatTopBar from '../components/TopBar';
import styles from './index.less';
import { Page } from '@/types/backend';

const ChatPage: React.FC = () => {
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
  const [currentFriend, setCurrentFriend] = useState<FriendInfo>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendUuid = params.get('currentFriend') || '';
  const { textMessage } = useMessageApi(friendUuid);
  const [meUuid, setMeUuid] = useState('');

  // 初始化当前用户信息
  useEffect(() => {
    initUserInfo()
  }, []);

  // 获取聊天记录
  useEffect(() => {
    getChatRecordFromStore(meUuid, friendUuid);
  }, [meUuid, friendUuid]);

  const getChatRecordFromStore = async (meUuid: string, friendUuid: string) => {
    try {
      let textRawText: TextMsgRaw = {
        nano_id: '', raw: '', recv_user: meUuid, send_user: friendUuid, text_type: 0, timestamp: 0
      };
      let page: Page = {
        size: 50,
        current: 1,
        total: 0
      };
      const data: TextMsgRaw[] = await invoke('get_chat_record_from_store', {
        textQuicMsg:  textRawText,
        page
      });
      console.log('textRawText', data)
      let chatMessages: ChatMessage[] = data.map((item) => {
        let from = item.send_user == meUuid ? MessageFrom.Mine : MessageFrom.Friend;
        const temp: ChatMessage = {
          from,
          text_msg_raw: item,
          ack: undefined
        };
        return temp;
      });
      setMessageList(chatMessages);
    }catch ( err){
      console.log(err);
    }
  };

  const initUserInfo = async () => {
    try {
      const data: string = await invoke('get_user_map', {
        key: 'uuid',
      });
      setMeUuid(data);
    }
    catch (err) {
      console.log(err);
    }
  };

  // 接收到外部消息
  useEffect(() => {
    if (textMessage) {
      let from = MessageFrom.Customer;
      if (textMessage.send_user == SYSTEM_ACCOUNT){
        from = MessageFrom.System;
      }
      const temp: ChatMessage = {
        from,
        text_msg_raw: textMessage,
        ack: undefined
      };
      // ack消息
      if (textMessage.text_type === 201){
        setMessageList((prevState) => {
          const index = prevState.findIndex((item) => item.text_msg_raw.nano_id === textMessage.raw);
          if (index !== -1) {
            prevState[index].ack = true;
          }
          return [...prevState, temp]
        });
      }else {
        setMessageList((prevState) => [...prevState, temp]);
      }

    }
  }, [textMessage]);

  const anchorSmooth = () => {
    const anchorTop = document.getElementById('anchor');
    if (anchorTop) {
      anchorTop.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    anchorSmooth();
  }, [messageList]);

  const handleMessageSent = (message: string) => {
    const temp: ChatMessage = JSON.parse( message)

    setMessageList((prev) => [...prev, temp]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ChatTopBar title={currentFriend?.username || ''} />
      </div>
      <div className={styles.mainContainer}>
        <div className={styles.messageContainer}>
          <MessageList
            messages={messageList}
            friendIcon={currentFriend?.icon}
          />
          <div id="anchor"></div>
        </div>
        <ChatFooter friendUuid={friendUuid} onMessageSent={handleMessageSent} />
      </div>
    </div>
  );
};

export default ChatPage;
