import { useChatSession } from '@/hooks/useChatSession';
import Message from '@/pages/Home/Chats/components/MessageBox';
import Search from '@/pages/Home/Chats/components/Search';
import { useBearStore } from '@/store/store';
import { ChatSessionVo } from '@/types/backend/vo';
import { invoke } from '@tauri-apps/api/core';
import { Splitter } from 'antd';
import { history, Outlet } from '@umijs/max';
import React, { useEffect } from 'react';
import styles from './index.less';

const ChatsLayout = () => {
  const [chatSessionList, setChatSessionList] = React.useState<ChatSessionVo[]>(
    [],
  );

  const { userInfo } = useBearStore();
  const { chatSessionEvent } = useChatSession(userInfo.uuid);
  const routeToChat = (item: ChatSessionVo) => {
    console.log('userInfo', userInfo, item);
    let uuid =
      item.send_user === userInfo?.uuid ? item.recv_user : item.send_user;
    history.push('/home/chats/chat?currentFriend=' + uuid);
  };

  useEffect(() => {
    console.log('本次chatSessionEvent', chatSessionEvent);
    setChatSessionList((prevList) => {
      if (!chatSessionEvent?.data) {
        return prevList;
      }
      console.log('prevList', prevList);

      const index = prevList.findIndex((item) => {
        if (
          item.send_user === chatSessionEvent.data.send_user &&
          item.recv_user === chatSessionEvent.data.recv_user
        ) {
          return true;
        } else if (
          item.send_user === chatSessionEvent.data.recv_user &&
          item.recv_user === chatSessionEvent.data.send_user
        ) {
          return true;
        } else {
          return false;
        }
      });

      console.log('index', index);
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
  }, [chatSessionEvent]);

  useEffect(() => {
    get_chat_session();
  }, []);

  useEffect(() => {
    console.log('chatSessionList', chatSessionList);
  }, [chatSessionList]);

  const get_chat_session = async () => {
    try {
      const res = (await invoke(
        'get_chat_session_from_store',
        {},
      )) as ChatSessionVo[];
      console.log('get_chat_session', res);
      setChatSessionList(res);
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <Splitter>
      <Splitter.Panel
        min="20%"
        max="50%"
        defaultSize="36%"
        className={styles.left}
      >
        <div className={styles.header}>
          <Search />
        </div>
        <div className={styles.item} key="chat">
          {chatSessionList.map((item: ChatSessionVo) => {
            return (
              <div key={item.nano_id} onClick={() => routeToChat(item)}>
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
      </Splitter.Panel>
      <Splitter.Panel className={styles.right}>
        <Outlet />
      </Splitter.Panel>
    </Splitter>
  );
};

export default ChatsLayout;
