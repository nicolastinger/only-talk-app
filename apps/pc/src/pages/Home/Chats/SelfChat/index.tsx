import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { useLocation, useIntl } from '@umijs/max';
import {
  ChatMessage,
  MessageFrom,
  Page,
  ResponseData,
  TextQuicMsgVo,
} from '@workspace/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import MessageList from '../components/MessageList';
import Splitter from '../components/Splitter';
import SelfChatFooter from './components/SelfChatFooter';
import styles from './index.less';

const PAGE_SIZE = 20;

/**
 * SelfChat 页面 - 自己给自己发送消息的聊天窗口
 * 与普通聊天窗口的区别：
 * 1. 隐藏 customer 消息（所有消息都是自己发的）
 * 2. 隐藏隐私窗口和 WebRTC 功能按钮
 * 3. TopBar 只显示标题，没有好友操作菜单
 */
const SelfChatPage: React.FC = () => {
  const intl = useIntl();
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
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
  const selfUuid = params.get('selfUuid') || '';

  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';
  const userInfo = useBearStore((state) => state.userInfo);
  // SelfChat 不需要监听 textMessage，因为所有消息都通过 handleMessageSent 添加
  // useMessageApi 监听的是 send_user === selfUuid 的消息，这会导致自己发的消息重复
  // const { textMessage } = useMessageApi(selfUuid, meUuid);

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
    loadChatRecordFromStore(meUuid, selfUuid, 1, true);
    setCurrentFriendSession(selfUuid);

    return () => {
      setCurrentFriendSession('-1');
    };
  }, [meUuid, selfUuid]);

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
        // 自己给自己的消息，所有消息都是 Mine
        const from = MessageFrom.Mine;
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

        const newIds = new Set(
          chatMessages.map((msg) => msg.text_msg_raw.nano_id),
        );
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
      loadChatRecordFromStore(meUuid, selfUuid, nextPage, false);
    }
  }, [currentPage, isLoading, hasMore, isInitialLoad, meUuid, selfUuid]);

  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // SelfChat 不需要处理 textMessage，所有消息通过 handleMessageSent 添加
  // useEffect(() => {
  //   if (textMessage) {
  //     // 检查是否已经通过 handleMessageSent 添加过（去重）
  //     if (pendingMessageIds.current.has(textMessage.nano_id)) {
  //       pendingMessageIds.current.delete(textMessage.nano_id);
  //       // 已通过 handleMessageSent 添加，跳过
  //       return;
  //     }
  //
  //     // 自己给自己的消息
  //     const temp: ChatMessage = {
  //       from: MessageFrom.Mine,
  //       text_msg_raw: textMessage,
  //       ack: undefined,
  //     };
  //     if (textMessage.text_type === 201) {
  //       setMessageList((prevState) => {
  //         const index = prevState.findIndex(
  //           (item) => item.text_msg_raw.nano_id === textMessage.raw,
  //         );
  //         if (index !== -1) {
  //           prevState[index].ack = true;
  //         }
  //         return [...prevState, temp];
  //       });
  //     } else {
  //       setNewMessageIds(new Set([textMessage.nano_id]));
  //       setMessageList((prevState) => [...prevState, temp]);
  //       setTimeout(() => {
  //         setNewMessageIds(new Set());
  //       }, 300);
  //     }
  //     setTimeout(() => {
  //       scrollToBottom();
  //     }, 100);
  //   }
  // }, [textMessage]);

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const handleMessageSent = (message: string) => {
    const temp: ChatMessage = JSON.parse(message);
    // SelfChat: 消息只在这里添加一次，不需要额外去重
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
        <div className={styles.headerTitle}>
          <span className={styles.selfChatIcon}>📝</span>
          <span>{userInfo?.username || intl.formatMessage({ id: 'chat.selfChat.me' })} - {intl.formatMessage({ id: 'chat.selfChat.notes' })}</span>
        </div>
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
              <span>{intl.formatMessage({ id: 'chat.loading' })}</span>
            </div>
          )}
          {!hasMore && messageList.length > 0 && (
            <div className={styles.noMoreIndicator}>{intl.formatMessage({ id: 'chat.noMoreMessages' })}</div>
          )}
          <MessageList
            messages={messageList}
            friendIcon={userInfo?.icon}
            friendUuid={selfUuid}
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
          <SelfChatFooter
            selfUuid={selfUuid}
            onMessageSent={handleMessageSent}
          />
        </div>
      </div>
    </div>
  );
};

export default SelfChatPage;
