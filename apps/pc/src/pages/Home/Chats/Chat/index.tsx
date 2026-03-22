import { SYSTEM_ACCOUNT } from '@/constants';
import { useMessageApi } from '@/hooks/useMessageApi';
import { useBearStore } from '@/store/store';
import { Page, TextQuicMsgVo } from '@workspace/types';
import { ResponseData } from '@workspace/types';
import { FriendVo } from '@workspace/types';
import { ChatMessage, MessageFrom, TextMsgRaw } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import ChatFooter from '../components/Footer';
import MessageList from '../components/MessageList';
import ChatTopBar from '../components/TopBar';
import Splitter from '../components/Splitter';
import styles from './index.less';

const ChatPage: React.FC = () => {
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [footerHeight, setFooterHeight] = useState(180); // 默认高度180px
  const [realFootHeight, setRealFooterHeight] = useState(186);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendUuid = params.get('currentFriend') || '';

  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';
  const { textMessage } = useMessageApi(friendUuid, meUuid);

  const handleHeightChange = (heightPercent: number) => {
    // 将百分比转换为像素值，限制在最小20px和最大80%之间
    const containerHeight = window.innerHeight;
    const minHeightPx = 20;
    const maxHeightPx = containerHeight * 0.8;
    const heightPx = Math.max(minHeightPx, Math.min(maxHeightPx, (heightPercent / 100) * containerHeight));
    setFooterHeight(heightPx);
  };

  useEffect(() => {
    setRealFooterHeight(footerHeight + 6)
  }, [footerHeight])

  // 更新已读记录
  useEffect(() => {
    if (messageList.length > 1) {
      let last_nano_id: string = '';
      const last_message = messageList[messageList.length - 1];
      last_nano_id = last_message.text_msg_raw.nano_id;
      if (last_nano_id !== '' && last_message.ack === undefined) {
        // 消息已读
        console.log('已读', messageList);
        markRead(last_nano_id);
      }
    }
  }, [messageList]);

  // 获取聊天记录
  useEffect(() => {
    getChatRecordFromStore(meUuid, friendUuid);
    getFriendInfo(friendUuid);
    markReadFriend(friendUuid);
    setCurrentFriendSession(friendUuid);
    
    // 组件卸载时清理当前好友会话
    return () => {
      setCurrentFriendSession('-1');
    };
  }, [meUuid, friendUuid]);

  // 设置当前好友会话
  const setCurrentFriendSession = async (friend: string) => {
    try {
      const res = await invoke('add_user_map', {
        map: {
          current_session_friend: friend
        }
      });
      console.log('设置当前好友会话', res);
    }catch (err){
      console.log(err);
    }
  };

  // 已读好友会话
  const markReadFriend = async (friendUuid: string) => {
    if (friendUuid == null ||friendUuid === '') {
      return;
    }
    try {
      const data: ResponseData = await invoke('mark_read_chat_session', {
        friendUuid,
      });
      console.log('已读好友会话', data);
    } catch (err) {
      console.log(err);
    }
  };

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
      let textRawText: TextQuicMsgVo = {
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
      const data: TextQuicMsgVo[] = await invoke('get_chat_record_from_store', {
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
        <div 
          className={styles.messageContainer}
          style={{ height: `calc(100% - ${realFootHeight}px)` }}
        >
          <MessageList
            messages={messageList}
            friendIcon={currentFriend?.friend_icon}
          />
          <div id="anchor"></div>
        </div>
        <Splitter 
          onHeightChange={handleHeightChange}
          minHeight={20}
          maxHeight={80}
        />
        <div style={{ height: `${footerHeight}px` }}>
          <ChatFooter friendUuid={friendUuid} onMessageSent={handleMessageSent} />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
