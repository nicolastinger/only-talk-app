import Message from '@/pages/Home/Chats/components/MessageBox';
import { get_friend_list } from '@/services/userService';
import { ResponseData } from '@/types/backend/httpRust';
import { FriendInfo } from '@/types/user/common';
import { invoke } from '@tauri-apps/api/core';
import { history, Outlet } from '@umijs/max';
import React, { useEffect } from 'react';
import styles from './index.less';
import { ChatSessionVo } from '@/types/backend/vo';
import useChatSession from '@/hooks/useChatSession';

const ChatsLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const [chatSessionList, setChatSessionList] = React.useState<ChatSessionVo[]>([]);

  const { chatSessionEvent } = useChatSession();
  const routeToChat = (uuid: string) => {
    history.push('/home/chats/chat?currentFriend=' + uuid);
  };

  useEffect(() => {
    console.log('本次chatSessionEvent', chatSessionEvent)
    setChatSessionList(prevList => {
      if (!chatSessionEvent?.data) {
        return prevList;
      }

      const index = prevList.findIndex(item => item.send_user === chatSessionEvent.data.send_user);

      // 创建新的数组，避免直接修改原数组
      const newList = [...prevList];

      let friend_icon = newList[index]?.friend_icon;
      let friend_name = newList[index]?.friend_name;
      if (chatSessionEvent.type === 0) {
        if (index !== -1) {
          // 更新现有会话
          newList[index] = chatSessionEvent.data;
          newList[index] = {
            ...newList[index],
            friend_icon: friend_icon,
            friend_name: friend_name,
          };
        } else {
          // 添加新会话
          newList.push(chatSessionEvent.data);
        }
      } else {
        if (index !== -1) {
          // 更新现有会话的属性
          newList[index] = {
            ...newList[index],
            unread_count: newList[index].unread_count + 1,
            last_message: chatSessionEvent.data.last_message,
            timestamp: chatSessionEvent.data.timestamp,
            is_show: chatSessionEvent.data.is_show,
            is_top: chatSessionEvent.data.is_top,
            nano_id: chatSessionEvent.data.nano_id,
            session_type: chatSessionEvent.data.session_type,
            text_type: chatSessionEvent.data.text_type,
            friend_icon: newList[index].friend_icon,
          };
        } else {
          // 添加新会话
          newList.push(chatSessionEvent.data);
        }
      }

      return newList;
    });
  }, [chatSessionEvent])

  useEffect(() => {
    get_chat_session();
  }, []);

  useEffect(() => {
    console.log('chatSessionList', chatSessionList)
  }, [chatSessionList])

  const get_chat_session = async () => {
    try {
      const res = await invoke('get_chat_session_from_store', {}) as ChatSessionVo[];
      console.log('get_chat_session', res);
      setChatSessionList(res)
    }
    catch (e) {
      console.log(e)
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>消息列表</div>
        <div className={styles.item} key="chat">
          {chatSessionList.map((item: ChatSessionVo) => {
            return (
              <div key={item.send_user} onClick={() => routeToChat(item.send_user)}>
                <Message
                  message={item.last_message}
                  img={item.friend_icon}
                  key={item.nano_id}
                  time={item.timestamp}
                  title={item.friend_name}
                  count={item.unread_count}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.right}>
        <Outlet />
      </div>
    </div>
  );
};

export default ChatsLayout;
