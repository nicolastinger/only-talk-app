import { useChatSession } from '@/hooks/useChatSession';
import Message from '@/pages/Home/Chats/components/MessageBox';
import Search from '@/pages/Home/Chats/components/Search';
import CreateGroupModal from '@/pages/Home/Chats/components/CreateGroupModal';
import { useBearStore } from '@/store/store';
import { clearAllUnreadSessions } from '@workspace/services';
import { invoke } from '@tauri-apps/api/core';
import { history, Outlet, useLocation } from '@umijs/max';
import { ChatSessionVo } from '@workspace/types';
import { Button, Segmented, Splitter, Popconfirm } from 'antd';
import { MessageOutlined, TeamOutlined, UsergroupAddOutlined, ClearOutlined } from '@ant-design/icons';
import React, { useEffect, useState, useMemo } from 'react';
import styles from './index.less';

type ChatTabType = 'private' | 'group';

const ChatsLayout = () => {
  const [chatSessionList, setChatSessionList] = React.useState<ChatSessionVo[]>(
    [],
  );
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('');
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTabType>('private');

  const { userInfo } = useBearStore();
  const refreshFlag = useBearStore((state) => state.refreshFlag);
  const location = useLocation();
  const { chatSessionEvent } = useChatSession(userInfo.uuid);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentFriend = params.get('currentFriend');
    const selfUuid = params.get('selfUuid');
    const groupId = params.get('groupId');

    if (currentFriend) {
      setSelectedSessionKey(currentFriend);
      setActiveTab('private');
    } else if (selfUuid) {
      setSelectedSessionKey(selfUuid);
      setActiveTab('private');
    } else if (groupId) {
      setSelectedSessionKey(groupId);
      setActiveTab('group');
    }
  }, [location.search]);

  const routeToChat = (item: ChatSessionVo) => {
    if (item.session_type === 2) {
      const groupId = item.group_id || item.send_user;
      history.push('/home/chats/group-chat?groupId=' + groupId);
      return;
    }
    if (item.send_user === item.recv_user) {
      history.push('/home/chats/self-chat?selfUuid=' + item.send_user);
      return;
    }
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
      const newList = [...prevList];

      let friend_icon = newList[index]?.friend_icon;
      let friend_name = newList[index]?.friend_name;
      if (chatSessionEvent.type === 0) {
        if (index !== -1) {
          newList[index] = chatSessionEvent.data;
          newList[index] = {
            ...newList[index],
            friend_icon: friend_icon,
            friend_name: friend_name,
          };
        } else {
          newList.push(chatSessionEvent.data);
        }
      } else {
        if (index !== -1) {
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
          newList.push(chatSessionEvent.data);
        }
      }

      return newList.sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [chatSessionEvent]);

  useEffect(() => {
    get_chat_session();
  }, []);

  useEffect(() => {
    if (refreshFlag > 0) {
      get_chat_session();
    }
  }, [refreshFlag]);

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
      const sortedList = res.sort((a, b) => b.timestamp - a.timestamp);
      setChatSessionList(sortedList);
    } catch (e) {
      console.log(e);
    }
  };

  const handleClearAllUnread = async () => {
    await clearAllUnreadSessions();
  };

  const privateChatList = useMemo(() => {
    return chatSessionList.filter((item) => item.session_type !== 2);
  }, [chatSessionList]);

  const groupChatList = useMemo(() => {
    return chatSessionList.filter((item) => item.session_type === 2);
  }, [chatSessionList]);

  const currentList = useMemo(() => {
    return activeTab === 'private' ? privateChatList : groupChatList;
  }, [activeTab, privateChatList, groupChatList]);

  const tabOptions = [
    {
      value: 'private',
      label: (
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageOutlined />
          <span>单聊</span>
        </div>
      ),
    },
    {
      value: 'group',
      label: (
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TeamOutlined />
          <span>群聊</span>
        </div>
      ),
    },
  ];

  return (
    <Splitter>
      <Splitter.Panel
        min="20%"
        max="50%"
        defaultSize="32%"
        className={styles.left}
      >
        <div style={{ height: '100%' }}>
        <div className={styles.header}>
          <Search />
          <Button
            type="text"
            icon={<UsergroupAddOutlined />}
            onClick={() => setCreateGroupVisible(true)}
            style={{ marginLeft: 8 }}
            title="创建群聊"
          />
          <Popconfirm
            title="确定清空所有未读消息？"
            onConfirm={handleClearAllUnread}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              icon={<ClearOutlined />}
              style={{ marginLeft: 4 }}
              title="清空未读"
            />
          </Popconfirm>
        </div>
        <div className={styles.tabContainer}>
          <Segmented
            value={activeTab}
            onChange={(value) => setActiveTab(value as ChatTabType)}
            options={tabOptions}
            block
          />
        </div>
        <CreateGroupModal
          visible={createGroupVisible}
          onCancel={() => setCreateGroupVisible(false)}
          onSuccess={(groupId) => {
            setCreateGroupVisible(false);
            if (groupId) {
              history.push('/home/chats/group-chat?groupId=' + groupId);
            }
          }}
        />
        <div className={styles.item} key="chat">
          {currentList.map((item: ChatSessionVo) => {
            const sessionKey =
              item.send_user === item.recv_user
                ? item.send_user
                : item.send_user === userInfo?.uuid
                ? item.recv_user
                : item.send_user;

            const isSelected = selectedSessionKey === sessionKey;

            return (
              <div key={item.nano_id} onClick={() => routeToChat(item)}>
                <Message
                  message={item.last_message}
                  img={item.friend_icon}
                  key={item.nano_id}
                  time={item.timestamp}
                  title={item.friend_name}
                  count={item.unread_count}
                  text_type={item.text_type}
                  send_user={item.send_user}
                  recv_user={item.recv_user}
                  isSelected={isSelected}
                />
              </div>
            );
          })}
        </div>
        </div>
      </Splitter.Panel>
      <Splitter.Panel className={styles.right}>
        <Outlet />
      </Splitter.Panel>
    </Splitter>
  );
};

export default ChatsLayout;
