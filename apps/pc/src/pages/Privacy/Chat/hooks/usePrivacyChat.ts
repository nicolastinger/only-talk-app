/**
 * 隐私聊天编排 hook
 *
 * 集中承载：消息收发状态、视频通话状态、来电弹窗、Tauri 事件监听、退出/发送等动作。
 * 页面组件仅负责把返回值渲染为 UI。
 */
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useIntl, useLocation } from '@umijs/max';
import { VideoCallInvite } from '@workspace/types';
import { message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface P2pTextMessage {
  type: string;
  send_user: string;
  text: string;
  timestamp: number;
}

export interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
  senderName?: string;
}

export function usePrivacyChat() {
  const intl = useIntl();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isVideoCallInitiator, setIsVideoCallInitiator] = useState(false);
  const [incomingCallInvite, setIncomingCallInvite] =
    useState<VideoCallInvite | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [friendName, setFriendName] = useState<string>(
    intl.formatMessage({ id: 'privacyChat.other' }),
  );
  const [myName, setMyName] = useState<string>(
    intl.formatMessage({ id: 'privacyChat.me' }),
  );

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  const scrollToBottom = useCallback(() => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // 新消息时自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 点击表情面板外部时关闭
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

  // 监听 P2P 事件（文本消息 / 视频邀请 / 视频结束）
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

  const handleEmojiClick = useCallback((emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim()) {
      return;
    }

    if (!friendId) {
      message.error(
        intl.formatMessage({ id: 'privacyChat.errors.noFriendId' }),
      );
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
      message.error(
        intl.formatMessage({ id: 'privacyChat.errors.sendFailed' }),
      );
    }
  }, [inputText, friendId, intl, myName]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleExit = useCallback(async () => {
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
      message.error(
        intl.formatMessage({ id: 'privacyChat.errors.exitFailed' }),
      );
    }
  }, [friendId, intl]);

  const startVideoCall = useCallback(() => {
    setIsVideoCallInitiator(true);
    setIsVideoCallActive(true);
  }, []);

  const acceptVideoCall = useCallback(async () => {
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
      message.error(
        intl.formatMessage({ id: 'privacyChat.errors.acceptCallFailed' }),
      );
    }
  }, [friendId, intl]);

  const rejectVideoCall = useCallback(async () => {
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
  }, [friendId, intl]);

  const handleVideoCallClose = useCallback(() => {
    setIsVideoCallActive(false);
    setIncomingCallInvite(null);
    setIsVideoCallInitiator(false);
  }, []);

  // 视频通话激活时，取消 PrivacyChat 的文本/邀请监听（由 PrivacyVideoCall 接管）
  useEffect(() => {
    if (isVideoCallActive) {
      console.log(
        '[PrivacyChat] PrivacyVideoCall 激活，取消 PrivacyChat 事件监听',
      );
      unlistenRef.current.forEach((unlisten) => unlisten());
      unlistenRef.current = [];
    }
  }, [isVideoCallActive]);

  return {
    friendId,
    messages,
    inputText,
    setInputText,
    isVideoCallActive,
    isVideoCallInitiator,
    incomingCallInvite,
    showIncomingCallModal,
    showEmojiPicker,
    setShowEmojiPicker,
    friendName,
    myName,
    messageContainerRef,
    emojiPickerRef,
    sendMessage,
    handleKeyPress,
    handleEmojiClick,
    handleExit,
    startVideoCall,
    acceptVideoCall,
    rejectVideoCall,
    handleVideoCallClose,
  };
}
