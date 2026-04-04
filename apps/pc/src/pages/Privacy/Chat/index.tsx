import { LockOutlined, LogoutOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { window } from '@tauri-apps/api';
import { useLocation } from '@umijs/max';
import { Button, Input, message, Modal } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PrivacyVideoCall from '@/components/Media/PrivacyVideoCall';
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
}

const PrivacyChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [incomingCallFrom, setIncomingCallFrom] = useState<string | null>(null);
  const [isCallInitiator, setIsCallInitiator] = useState(false);
  
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

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
          };
          setMessages((prev) => [...prev, newMessage]);
        } catch (e) {
          console.error('解析p2p消息失败:', e);
        }
      });

      const unlistenVideoCall = await listen<string>('video_call_invite', (event) => {
        console.log('收到视频通话邀请:', event.payload);
        try {
          const data = JSON.parse(event.payload);
          setIncomingCallFrom(data.from_uuid);
        } catch (e) {
          console.error('解析视频通话邀请失败:', e);
        }
      });

      const unlistenMediaControl = await listen<string>('media_control', (event) => {
        console.log('收到媒体控制:', event.payload);
        try {
          const control = JSON.parse(event.payload);
          if (control.control_type === 'EndCall') {
            setIsVideoCallActive(false);
            setIncomingCallFrom(null);
            setIsCallInitiator(false);
          }
        } catch (e) {
          console.error('解析媒体控制失败:', e);
        }
      });

      unlisteners.push(unlistenText, unlistenVideoCall, unlistenMediaControl);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) {
      return;
    }

    if (!friendId) {
      message.error('无法获取好友ID');
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
      };
      setMessages((prev) => [...prev, newMessage]);
      setInputText('');
    } catch (e) {
      console.error('发送消息失败:', e);
      message.error('发送消息失败');
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
      message.error('退出失败');
    }
  };

  const startVideoCall = useCallback(async () => {
    if (!friendId) {
      message.error('无法获取好友ID');
      return;
    }

    try {
      await invoke('send_p2p_video_call_invite', {
        targetUuid: friendId,
      });
      
      setIsCallInitiator(true);
      setIsVideoCallActive(true);
    } catch (e) {
      console.error('发起视频通话失败:', e);
      message.error('发起视频通话失败');
    }
  }, [friendId]);

  const acceptVideoCall = useCallback(() => {
    setIsCallInitiator(false);
    setIsVideoCallActive(true);
    setIncomingCallFrom(null);
  }, []);

  const rejectVideoCall = useCallback(async () => {
    if (incomingCallFrom) {
      try {
        await invoke('send_p2p_media_control', {
          controlType: 'EndCall',
          enabled: false,
          targetUuid: incomingCallFrom,
        });
      } catch (e) {
        console.error('拒绝视频通话失败:', e);
      }
    }
    setIncomingCallFrom(null);
  }, [incomingCallFrom]);

  const handleVideoCallClose = useCallback(() => {
    setIsVideoCallActive(false);
    setIncomingCallFrom(null);
    setIsCallInitiator(false);
  }, []);

  if (isVideoCallActive) {
    return (
      <div className={styles.videoCallPage}>
        <PrivacyVideoCall 
          friendId={friendId} 
          onClose={handleVideoCallClose}
          isInitiator={isCallInitiator}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Modal
        title="视频通话邀请"
        open={incomingCallFrom !== null}
        onOk={acceptVideoCall}
        onCancel={rejectVideoCall}
        okText="接受"
        cancelText="拒绝"
      >
        <p>对方邀请你进行视频通话，是否接受？</p>
      </Modal>

      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <LockOutlined className={styles.privacyIcon} />
          <span className={styles.title}>隐私聊天</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="text"
            icon={<VideoCameraOutlined />}
            onClick={startVideoCall}
            className={styles.videoCallBtn}
          >
            视频通话
          </Button>
          <Button
            className={styles.exitBtn}
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleExit}
          >
            退出
          </Button>
        </div>
      </div>
      <div className={styles.hint}>
        隐私聊天消息不会保存到本地，关闭窗口后消息将消失
      </div>
      <div ref={messageContainerRef} className={styles.messageContainer}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageItem} ${msg.isMine ? styles.mine : styles.friend}`}
          >
            <div className={styles.messageBubble}>{msg.text}</div>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <div className={styles.inputArea}>
          <TextArea
            className={styles.textArea}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
          <Button type="primary" onClick={sendMessage}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyChat;
