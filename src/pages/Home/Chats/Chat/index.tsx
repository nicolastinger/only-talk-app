import { SYSTEM_ACCOUNT } from '@/constants';
import { useMessageApi } from '@/hooks/useMessageApi';
import { useBearStore } from '@/store/store';
import { Page } from '@/types/backend';
import { ResponseData } from '@/types/backend/httpRust';
import { FriendVo } from '@/types/backend/vo';
import { ChatMessage, MessageFrom, TextMsgRaw } from '@/types/user/common';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import ChatFooter from '../components/Footer';
import MessageList from '../components/MessageList';
import ChatTopBar from '../components/TopBar';
import styles from './index.less';

const ChatPage: React.FC = () => {
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendUuid = params.get('currentFriend') || '';

  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';
  const { textMessage } = useMessageApi(friendUuid, meUuid);

  // 更新已读记录
  useEffect(() => {
    let last_time = 0;
    if (messageList.length > 1) {
      let last_message: string = '';
      for (let i = 0; i < messageList.length; i++) {
        let last_record: ChatMessage = messageList[i];
        if (last_record.from === MessageFrom.System) {
          continue;
        }
        if (last_record.text_msg_raw.timestamp > last_time) {
          last_time = last_record.text_msg_raw.timestamp;
          last_message = last_record.text_msg_raw.nano_id;
        }
      }
      if (last_message !== '') {
        // 消息已读
        markRead(last_message);
      }
      // 会话更新
    }
  }, [messageList]);

  // 获取聊天记录
  useEffect(() => {
    getChatRecordFromStore(meUuid, friendUuid);
    getFriendInfo(friendUuid);
  }, [meUuid, friendUuid]);

  // 已读当前会话聊天记录
  const markRead = async (last_read_record: string) => {
    try {
      let lastList = [] as string[];
      if (last_read_record) {
        lastList.push(last_read_record);
      }
      const data: ResponseData = await invoke('mark_read', {
        textQuicMsgVec: lastList,
      });
      console.log('已读', data);
    } catch (err) {
      console.log(err);
    }
  };

  // 获取好友信息
  const getFriendInfo = async (friendUuid: string) => {
    try {
      const data: FriendVo = await invoke('get_friend_info', {
        friendUuid,
      });
      console.log('好友信息', data);
      setCurrentFriend(data);
    } catch (err) {
      console.log(err);
    }
  };

  const getChatRecordFromStore = async (meUuid: string, friendUuid: string) => {
    try {
      let textRawText: TextMsgRaw = {
        nano_id: '',
        raw: '',
        recv_user: meUuid,
        send_user: friendUuid,
        text_type: 0,
        timestamp: 0,
      };
      let page: Page = {
        size: 50,
        current: 1,
        total: 0,
      };
      const data: TextMsgRaw[] = await invoke('get_chat_record_from_store', {
        textQuicMsg: textRawText,
        page,
      });
      if (data.length === 0) {
        return;
      }

      let chatMessages: ChatMessage[] = data.map((item) => {
        let from =
          item.send_user == meUuid ? MessageFrom.Mine : MessageFrom.Friend;
        const temp: ChatMessage = {
          from,
          text_msg_raw: item,
          ack: undefined,
        };
        return temp;
      });
      setMessageList(chatMessages);
      // 使用reduce()直接找到最大值（性能更好）
      if (chatMessages.length > 0) {
        const last_read_record = chatMessages.reduce((latest, current) =>
          latest.text_msg_raw.timestamp > current.text_msg_raw.timestamp
            ? latest
            : current,
        )?.text_msg_raw.nano_id;
        markRead(last_read_record);
      }
    } catch (err) {
      console.log(err);
    }
  };

  // 接收到外部消息
  useEffect(() => {
    if (textMessage) {
      let from = MessageFrom.Customer;
      if (textMessage.send_user == SYSTEM_ACCOUNT) {
        from = MessageFrom.System;
      }
      const temp: ChatMessage = {
        from,
        text_msg_raw: textMessage,
        ack: undefined,
      };
      // ack消息
      if (textMessage.text_type === 201) {
        setMessageList((prevState) => {
          const index = prevState.findIndex(
            (item) => item.text_msg_raw.nano_id === textMessage.raw,
          );
          if (index !== -1) {
            prevState[index].ack = true;
          }
          return [...prevState, temp];
        });
      } else {
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
    const temp: ChatMessage = JSON.parse(message);

    setMessageList((prev) => [...prev, temp]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ChatTopBar title={currentFriend?.friend_name || ''} />
      </div>
      <div className={styles.mainContainer}>
        <div className={styles.messageContainer}>
          <MessageList
            messages={messageList}
            friendIcon={currentFriend?.friend_icon}
          />
          <div id="anchor"></div>
        </div>
        <ChatFooter friendUuid={friendUuid} onMessageSent={handleMessageSent} />
      </div>
    </div>
  );
};

export default ChatPage;
