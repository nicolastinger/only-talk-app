import { SYSTEM_ACCOUNT } from '@/constants';
import { useMessageApi } from '@/hooks/useMessageApi';
import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { useLocation } from '@umijs/max';
import {
  ChatMessage,
  GroupVo,
  MessageFrom,
  Page,
  ResponseData,
  TextQuicMsgVo,
} from '@workspace/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChatFooter from '../components/Footer';
import MessageList from '../components/MessageList';
import Splitter from '../components/Splitter';
import GroupTopBar from '../components/GroupTopBar';
import styles from '../Chat/index.less';

const PAGE_SIZE = 20;

const GroupChatPage: React.FC = () => {
  const [messageList, setMessageList] = useState<ChatMessage[]>([]);
  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
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
  const [isUploading, setIsUploading] = useState(false);

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const groupId = params.get('groupId') || '';

  const meUuid = useBearStore((state) => state.userInfo.uuid) || '';
  // Use useMessageApi with null sender to receive all messages for the group
  const { textMessage } = useMessageApi(null as any, groupId);

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
      let last_nano_id = '';
      const last_message = messageList[messageList.length - 1];
      last_nano_id = last_message.text_msg_raw.nano_id;
      if (last_nano_id !== '' && last_message.ack === undefined) {
        markRead(last_nano_id);
      }
    }
  }, [messageList]);

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    setIsInitialLoad(true);
    setMessageList([]);
    loadChatRecord(groupId, 1, true);
    getGroupInfo(groupId);
    setCurrentGroupSession(groupId);

    const handleUploadStartEvent = () => setIsUploading(true);
    const handleUploadEndEvent = () => setIsUploading(false);

    window.addEventListener('uploadStart', handleUploadStartEvent);
    window.addEventListener('uploadEnd', handleUploadEndEvent);

    return () => {
      setCurrentGroupSession('');
      window.removeEventListener('uploadStart', handleUploadStartEvent);
      window.removeEventListener('uploadEnd', handleUploadEndEvent);
    };
  }, [groupId]);

  const setCurrentGroupSession = async (group: string) => {
    try {
      await invoke('add_user_map', {
        map: { current_session_friend: group },
      });
    } catch (err) {
      console.log(err);
    }
  };

  const getGroupInfo = async (groupId: string) => {
    try {
      const data: GroupVo = await invoke('get_group_info_command', {
        groupId,
      });
      setGroupInfo(data);
    } catch (err) {
      console.log('获取群信息失败，从本地加载', err);
      try {
        const localGroups: GroupVo[] = await invoke('get_group_list');
        const found = localGroups.find((g) => g.group_id === groupId);
        if (found) setGroupInfo(found);
      } catch (e) {
        console.log(e);
      }
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

  const loadChatRecord = async (
    groupId: string,
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
        send_user: groupId,
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
          item.send_user === meUuid ? MessageFrom.Mine : MessageFrom.Customer;
        const temp: ChatMessage = {
          from,
          text_msg_raw: item,
          ack: undefined,
          sender_uuid: item.send_user,
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
      loadChatRecord(groupId, nextPage, false);
    }
  }, [currentPage, isLoading, hasMore, isInitialLoad, groupId]);

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
      if (textMessage.send_user === SYSTEM_ACCOUNT) {
        from = MessageFrom.System;
      }
      if (textMessage.send_user === meUuid) {
        from = MessageFrom.Mine;
      }
      const temp: ChatMessage = {
        from,
        text_msg_raw: textMessage,
        ack: undefined,
        sender_uuid: textMessage.send_user,
      };
      if (textMessage.text_type === 201) {
        setMessageList((prevState) => {
          const index = prevState.findIndex(
            (item) => item.text_msg_raw.nano_id === textMessage.raw,
          );
          if (index !== -1) {
            prevState[index].ack = true;
            const ackedMessage = prevState[index];
            const ackedMessageType = ackedMessage.text_msg_raw.text_type;
            if (ackedMessageType === 2 || ackedMessageType === 3) {
              setCurrentPage(1);
              setHasMore(true);
              setIsInitialLoad(true);
              loadChatRecord(groupId, 1, true);
            }
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

  const handleUploadStart = () => {
    setIsUploading(true);
  };

  const handleUploadEnd = () => {
    setIsUploading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <GroupTopBar
          title={groupInfo?.group_name || ''}
          groupId={groupId}
          memberCount={groupInfo?.member_count || 0}
        />
        {isUploading && (
          <div className={styles.uploadLoadingBar}>
            <div className={styles.uploadLoadingProgress} />
          </div>
        )}
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
            groupMode={true}
            friendUuid={groupId}
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
            friendUuid={groupId}
            onMessageSent={handleMessageSent}
            onUploadStart={handleUploadStart}
            onUploadEnd={handleUploadEnd}
          />
        </div>
      </div>
    </div>
  );
};

export default GroupChatPage;
