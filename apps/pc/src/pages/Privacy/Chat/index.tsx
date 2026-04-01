import { LockOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useLocation } from '@umijs/max';
import { Button, Input, message } from 'antd';
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
}

const PrivacyChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('p2p_text_message', (event) => {
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
      } catch (e) {
        console.error('监听p2p消息失败:', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
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

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <LockOutlined className={styles.privacyIcon} />
        <span className={styles.title}>隐私聊天</span>
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
