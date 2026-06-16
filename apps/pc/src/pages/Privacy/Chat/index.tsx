/**
 * 隐私聊天页面
 *
 * 功能说明：
 * 1. 隐私文本聊天 - 消息不保存到本地
 * 2. 视频通话 - 支持发起和接收视频通话邀请
 * 3. P2P通信 - 所有消息通过P2P连接传输
 *
 * 布局说明：
 * - 视频区域占80%宽度
 * - 聊天消息区域占20%宽度
 * - 所有消息都在右侧渲染
 */
import PrivacyVideoCall from '@/components/Media/PrivacyVideoCall';
import {
  LockOutlined,
  LogoutOutlined,
  SendOutlined,
  SmileOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useIntl, useLocation } from '@umijs/max';
import { VideoCallInvite } from '@workspace/types';
import { Button, Input, message, Modal, Tooltip } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from './index.less';

const { TextArea } = Input;

interface P2pTextMessage {
  type: string;
  send_user: string;
  text: string;
  timestamp: number;
}

interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
  senderName?: string;
}

const EMOJI_LIST = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '🤣',
  '😂',
  '🙂',
  '🙃',
  '😉',
  '😊',
  '😇',
  '🥰',
  '😍',
  '🤩',
  '😘',
  '😗',
  '😚',
  '😙',
  '🥲',
  '😋',
  '😛',
  '😜',
  '🤪',
  '😝',
  '🤑',
  '🤗',
  '🤭',
  '🤫',
  '🤔',
  '🤐',
  '🤨',
  '😐',
  '😑',
  '😶',
  '😏',
  '😒',
  '🙄',
  '😬',
  '😮‍💨',
  '🤥',
  '😌',
  '😔',
  '😪',
  '🤤',
  '😴',
  '😷',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🤝',
  '🙏',
  '💪',
  '🤘',
  '❤️',
  '💔',
  '💯',
  '🔥',
  '⭐',
  '✨',
  '💥',
  '🎉',
];

const PrivacyChat: React.FC = () => {
  const intl = useIntl();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isVideoCallInitiator, setIsVideoCallInitiator] = useState(false);
  const [incomingCallInvite, setIncomingCallInvite] =
    useState<VideoCallInvite | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [friendName, setFriendName] = useState<string>(intl.formatMessage({ id: 'privacyChat.other' }));
  const [myName, setMyName] = useState<string>(intl.formatMessage({ id: 'privacyChat.me' }));

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenText = await listen<string>('p2p_text_message', (event) => {
        console.log('收到p2p文本消息:', event.payload);
        try {
          const p2pMsg: P2pTextMessage = JSON.parse(event.payload);
          const newMessage: ChatMessageItem = {
            id: `${Date.now()}_${Math.random()}`,
            text: p2pMsg.text,
            isMine: false,
            timestamp: p2pMsg.timestamp || Date.now(),
            senderName: friendName,
          };
          setMessages((prev) => [...prev, newMessage]);
        } catch (e) {
          console.error('解析p2p消息失败:', e);
        }
      });

      const unlistenInvite = await listen<string>(
        'video_call_invite',
        (event) => {
          console.log('收到视频通话邀请:', event.payload);
          try {
            const invite: VideoCallInvite = JSON.parse(event.payload);
            setIncomingCallInvite(invite);
            setShowIncomingCallModal(true);
          } catch (e) {
            console.error('解析视频通话邀请失败:', e);
          }
        },
      );

      const unlistenEnd = await listen<string>('video_call_end', (event) => {
        console.log('视频通话已结束:', event.payload);
        setIsVideoCallActive(false);
        setIncomingCallInvite(null);
        setShowIncomingCallModal(false);
      });

      unlistenRef.current = [unlistenText, unlistenInvite, unlistenEnd];
    };

    setupListeners();

    return () => {
      unlistenRef.current.forEach((unlisten) => unlisten());
    };
  }, [friendName]);

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleEmojiClick = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim()) {
      return;
    }

    if (!friendId) {
      message.error(intl.formatMessage({ id: 'privacyChat.errors.noFriendId' }));
      return;
    }

    try {
      await invoke('send_p2p_text_msg', {
        text: inputText.trim(),
        targetUuid: friendId,
      });

      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.trim(),
        isMine: true,
        timestamp: Date.now(),
        senderName: myName,
      };
      setMessages((prev) => [...prev, newMessage]);
      setInputText('');
    } catch (e) {
      console.error('发送消息失败:', e);
      message.error(intl.formatMessage({ id: 'privacyChat.errors.sendFailed' }));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleExit = async () => {
    try {
      if (friendId) {
        await invoke('close_p2p_connection', {
          targetUuid: friendId,
        });
      }
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      console.error('退出失败:', e);
      message.error(intl.formatMessage({ id: 'privacyChat.errors.exitFailed' }));
    }
  };

  const startVideoCall = () => {
    setIsVideoCallInitiator(true);
    setIsVideoCallActive(true);
  };

  const acceptVideoCall = async () => {
    setShowIncomingCallModal(false);
    setIsVideoCallInitiator(false);
    setIsVideoCallActive(true);
    try {
      await invoke('send_p2p_video_call_response', {
        targetUuid: friendId,
        accept: true,
        mediaConfig: null,
        rejectReason: null,
      });
    } catch (e) {
      console.error('接受视频通话失败:', e);
      message.error(intl.formatMessage({ id: 'privacyChat.errors.acceptCallFailed' }));
    }
  };

  const rejectVideoCall = async () => {
    setShowIncomingCallModal(false);
    try {
      await invoke('send_p2p_video_call_response', {
        targetUuid: friendId,
        accept: false,
        mediaConfig: null,
        rejectReason: intl.formatMessage({ id: 'privacyChat.userRejected' }),
      });
    } catch (e) {
      console.error('拒绝视频通话失败:', e);
    }
    setIncomingCallInvite(null);
  };

  const handleVideoCallClose = () => {
    setIsVideoCallActive(false);
    setIncomingCallInvite(null);
    setIsVideoCallInitiator(false);
  };

  useEffect(() => {
    if (isVideoCallActive) {
      console.log(
        '[PrivacyChat] PrivacyVideoCall 激活，取消 PrivacyChat 事件监听',
      );
      unlistenRef.current.forEach((unlisten) => unlisten());
      unlistenRef.current = [];
    }
  }, [isVideoCallActive]);

  const renderMessage = (msg: ChatMessageItem) => {
    const meText = intl.formatMessage({ id: 'privacyChat.me' });
    const otherText = intl.formatMessage({ id: 'privacyChat.other' });
    const displayName = msg.isMine
      ? `${msg.senderName || meText}(${meText})`
      : msg.senderName || otherText;

    return (
      <div key={msg.id} className={styles.messageRow}>
        <div className={styles.messageItem}>
          <div className={styles.messageHeader}>
            <span className={styles.senderName}>{displayName}</span>
            <span className={styles.messageTime}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
          <div
            className={`${styles.messageBubble} ${
              msg.isMine ? styles.mineBubble : styles.friendBubble
            }`}
          >
            {msg.text}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.videoSection}>
        {isVideoCallActive ? (
          <PrivacyVideoCall
            friendId={friendId}
            isInitiator={isVideoCallInitiator}
            inviteInfo={incomingCallInvite}
            onClose={handleVideoCallClose}
          />
        ) : (
          <div className={styles.videoPlaceholder}>
            <div className={styles.placeholderContent}>
              <VideoCameraOutlined className={styles.placeholderIcon} />
              <p className={styles.placeholderText}>{intl.formatMessage({ id: 'privacyChat.videoPlaceholder' })}</p>
              <Button
                type="primary"
                size="large"
                icon={<VideoCameraOutlined />}
                onClick={startVideoCall}
                className={styles.startVideoBtn}
              >
                {intl.formatMessage({ id: 'privacyChat.startVideoCall' })}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.chatSection}>
        <div className={styles.chatHeader}>
          <div className={styles.titleWrapper}>
            <LockOutlined className={styles.privacyIcon} />
            <span className={styles.title}>{intl.formatMessage({ id: 'privacyChat.title' })}</span>
          </div>
          <Button
            className={styles.exitBtn}
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleExit}
            size="small"
          />
        </div>

        <div className={styles.hint}>{intl.formatMessage({ id: 'privacyChat.hint' })}</div>

        <div ref={messageContainerRef} className={styles.messageContainer}>
          {messages.length === 0 ? (
            <div className={styles.emptyMessage}>
              <span>{intl.formatMessage({ id: 'privacyChat.noMessages' })}</span>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.toolbar}>
            <div className={styles.emojiWrapper} ref={emojiPickerRef}>
              <Tooltip title={intl.formatMessage({ id: 'privacyChat.emoji' })}>
                <Button
                  type="text"
                  icon={<SmileOutlined />}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={styles.toolbarBtn}
                />
              </Tooltip>
              {showEmojiPicker && (
                <div className={styles.emojiPicker}>
                  <div className={styles.emojiGrid}>
                    {EMOJI_LIST.map((emoji, index) => (
                      <span
                        key={index}
                        className={styles.emojiItem}
                        onClick={() => handleEmojiClick(emoji)}
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.inputArea}>
            <TextArea
              className={styles.textArea}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={intl.formatMessage({ id: 'privacyChat.inputPlaceholder' })}
              autoSize={{ minRows: 1, maxRows: 3 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              className={styles.sendBtn}
            />
          </div>
        </div>
      </div>

      <Modal
        title={intl.formatMessage({ id: 'privacyChat.videoCallInvite' })}
        open={showIncomingCallModal}
        onOk={acceptVideoCall}
        onCancel={rejectVideoCall}
        okText={intl.formatMessage({ id: 'privacyChat.accept' })}
        cancelText={intl.formatMessage({ id: 'privacyChat.reject' })}
      >
        <p>{incomingCallInvite?.from_name || intl.formatMessage({ id: 'privacyChat.other' })} {intl.formatMessage({ id: 'privacyChat.inviteToVideoCall' })}</p>
      </Modal>
    </div>
  );
};

export default PrivacyChat;
