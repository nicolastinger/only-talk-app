import { SYSTEM_ACCOUNT } from '@/constants';
import { useMessageApi } from '@/hooks/useMessageApi';
import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from '@umijs/max';
import {
  ChatMessage,
  FriendVo,
  MessageFrom,
  Page,
  ResponseData,
  TextQuicMsgVo,
} from '@workspace/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChatFooter from '../components/Footer';
import MessageList from '../components/MessageList';
import Splitter from '../components/Splitter';
import ChatTopBar from '../components/TopBar';
import styles from './index.less';

const PAGE_SIZE = 20;

const ChatPage: React.FC = () => {
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
  const [currentFriend, setCurrentFriend] = useState<FriendVo>();
  const [footerHeight, setFooterHeight] = useState(180);
  const [realFootHeight, setRealFooterHeight] = useState(186);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [loadedMessageIds, setLoadedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendUuid = params.get('currentFriend') || '';

  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';
  const { textMessage } = useMessageApi(friendUuid, meUuid);

  const handleHeightChange = (heightPercent: number) => {
    const containerHeight = window.innerHeight;
    const minHeightPx = 20;
    const maxHeightPx = containerHeight * 0.8;
    const heightPx = Math.max(
      minHeightPx,
      Math.min(maxHeightPx, (heightPercent / 100) * containerHeight),
    );
    setFooterHeight(heightPx);
  };

  useEffect(() => {
    setRealFooterHeight(footerHeight + 6);
  }, [footerHeight]);

  useEffect(() => {
    if (messageList.length > 1) {
      let last_nano_id: string = '';
      const last_message = messageList[messageList.length - 1];
      last_nano_id = last_message.text_msg_raw.nano_id;
      if (last_nano_id !== '' && last_message.ack === undefined) {
        console.log('已读', messageList);
        markRead(last_nano_id);
      }
    }
  }, [messageList]);

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    setIsInitialLoad(true);
    setMessageList([]);
    loadChatRecordFromStore(meUuid, friendUuid, 1, true);
    getFriendInfo(friendUuid);
    markReadFriend(friendUuid);
    setCurrentFriendSession(friendUuid);

    return () => {
      setCurrentFriendSession('-1');
    };
  }, [meUuid, friendUuid]);

  const setCurrentFriendSession = async (friend: string) => {
    try {
      const res = await invoke('add_user_map', {
        map: {
          current_session_friend: friend,
        },
      });
      console.log('设置当前好友会话', res);
    } catch (err) {
      console.log(err);
    }
  };

  const markReadFriend = async (friendUuid: string) => {
    if (friendUuid == null || friendUuid === '') {
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

  const loadChatRecordFromStore = async (
    meUuid: string,
    friendUuid: string,
    page: number,
    isInitial: boolean = false,
  ) => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const textRawText: TextQuicMsgVo = {
        nano_id: '',
        raw: '',
        recv_user: meUuid,
        send_user: friendUuid,
        text_type: 0,
        timestamp: 0,
      };
      const pageParam: Page = {
        size: PAGE_SIZE,
        current: page,
        total: 0,
      };
      const data: TextQuicMsgVo[] = await invoke('get_chat_record_from_store', {
        textQuicMsg: textRawText,
        page: pageParam,
      });

      if (data.length === 0) {
        setHasMore(false);
        return;
      }

      const chatMessages: ChatMessage[] = data.map((item) => {
        const from =
          item.send_user == meUuid ? MessageFrom.Mine : MessageFrom.Friend;
        const temp: ChatMessage = {
          from,
          text_msg_raw: item,
          ack: undefined,
        };
        return temp;
      });

      if (isInitial) {
        setMessageList(chatMessages);
        setIsInitialLoad(false);
        setTimeout(() => {
          scrollToBottom();
        }, 100);
        if (chatMessages.length > 0) {
          const last_read_record = chatMessages.reduce((latest, current) =>
            latest.text_msg_raw.timestamp > current.text_msg_raw.timestamp
              ? latest
              : current,
          )?.text_msg_raw.nano_id;
          markRead(last_read_record);
        }
      } else {
        const container = messageContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;

        const newIds = new Set(chatMessages.map((msg) => msg.text_msg_raw.nano_id));
        setLoadedMessageIds(newIds);

        setMessageList((prev) => [...chatMessages, ...prev]);

        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        }, 0);

        setTimeout(() => {
          setLoadedMessageIds(new Set());
        }, 300);
      }

      if (data.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      console.log(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = useCallback(() => {
    const container = messageContainerRef.current;
    if (!container || isLoading || !hasMore || isInitialLoad) return;

    if (container.scrollTop <= 50) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadChatRecordFromStore(meUuid, friendUuid, nextPage, false);
    }
  }, [currentPage, isLoading, hasMore, isInitialLoad, meUuid, friendUuid]);

  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

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
        setNewMessageIds(new Set([textMessage.nano_id]));
        setMessageList((prevState) => [...prevState, temp]);
        setTimeout(() => {
          setNewMessageIds(new Set());
        }, 300);
      }
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [textMessage]);

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const handleMessageSent = (message: string) => {
    const temp: ChatMessage = JSON.parse(message);
    setNewMessageIds(new Set([temp.text_msg_raw.nano_id]));
    setMessageList((prev) => [...prev, temp]);
    setTimeout(() => {
      scrollToBottom();
    }, 100);
    setTimeout(() => {
      setNewMessageIds(new Set());
    }, 300);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ChatTopBar title={currentFriend?.friend_name || ''} friendInfo={currentFriend} />
      </div>
      <div className={styles.mainContainer}>
        <div
          ref={messageContainerRef}
          className={styles.messageContainer}
          style={{ height: `calc(100% - ${realFootHeight}px)` }}
        >
          {isLoading && !isInitialLoad && (
            <div className={styles.loadingIndicator}>
              <div className={styles.loadingSpinner}></div>
              <span>加载中...</span>
            </div>
          )}
          {!hasMore && messageList.length > 0 && (
            <div className={styles.noMoreIndicator}>没有更多消息了</div>
          )}
          <MessageList
            messages={messageList}
            friendIcon={currentFriend?.friend_icon}
            newMessageIds={newMessageIds}
            loadedMessageIds={loadedMessageIds}
          />
          <div id="anchor"></div>
        </div>
        <Splitter
          onHeightChange={handleHeightChange}
          minHeight={20}
          maxHeight={80}
        />
        <div style={{ height: `${footerHeight}px` }}>
          <ChatFooter
            friendUuid={friendUuid}
            onMessageSent={handleMessageSent}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
