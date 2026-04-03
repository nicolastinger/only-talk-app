import { ApiOutlined, LogoutOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { window } from '@tauri-apps/api';
import { useLocation } from '@umijs/max';
import { Button, Input, message, Spin, Tag } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { initWebRTCService, getWebRTCService } from '@/services/webrtcService';
import { WebRTCSignalMessage } from '@workspace/types';
import styles from './index.less';

const { TextArea } = Input;

interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
}

interface WebRTCSignalMsgRaw {
  type: 'offer' | 'answer' | 'candidate';
  sender: string;
  receiver: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

interface TextQuicMsgVo {
  nano_id: string;
  text_type: number;
  raw: string;
  recv_user: string;
  send_user: string;
  timestamp: number;
}

const WebRTCChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'failed'>('connecting');
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';
  const isInitiator = params.get('initiator') === 'true';
  const localUserId = params.get('localUserId') || '';
  const initialSignalData = params.get('signalData');

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const initWebRTC = async () => {
      const service = initWebRTCService(localUserId);

      service.setOnMessageCallback((fromFriendId: string, msg: string) => {
        const newMessage: ChatMessageItem = {
          id: `${Date.now()}_${Math.random()}`,
          text: msg,
          isMine: false,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
      });

      service.setOnConnectionStateChange((fromFriendId: string, state: RTCPeerConnectionState) => {
        if (state === 'connected') {
          setConnectionStatus('connected');
        } else if (state === 'disconnected' || state === 'closed') {
          setConnectionStatus('disconnected');
        } else if (state === 'failed') {
          setConnectionStatus('failed');
        }
      });

      if (isInitiator) {
        try {
          const offer = await service.createOffer(friendId);
          const signalMessage: WebRTCSignalMessage = {
            type: 'offer',
            sender: localUserId,
            receiver: friendId,
            sessionId: service.sessionId,
            data: offer,
            timestamp: Date.now(),
          };
          await service.sendSignal(signalMessage);
        } catch (e) {
          console.error('Failed to create offer:', e);
          message.error('创建连接失败');
        }
      } else if (initialSignalData) {
        try {
          const signalMsg: WebRTCSignalMsgRaw = JSON.parse(decodeURIComponent(initialSignalData));
          if (signalMsg.type === 'offer') {
            const answer = await service.handleOffer(friendId, signalMsg.data);
            const responseSignal: WebRTCSignalMessage = {
              type: 'answer',
              sender: localUserId,
              receiver: friendId,
              sessionId: signalMsg.sessionId,
              data: answer,
              timestamp: Date.now(),
            };
            await service.sendSignal(responseSignal);
          }
        } catch (e) {
          console.error('Failed to handle initial signal:', e);
          message.error('处理初始信令失败');
        }
      }
    };

    initWebRTC();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('webrtc_signal', async (event) => {
          console.log('WebRTC 聊天窗口收到信令:', event.payload);
          try {
            const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
            const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw);
            
            if (signalMsg.sender !== friendId) {
              return;
            }

            const service = getWebRTCService();
            if (!service) return;

            if (signalMsg.type === 'answer') {
              await service.handleAnswer(friendId, signalMsg.data);
            } else if (signalMsg.type === 'candidate') {
              await service.handleCandidate(friendId, signalMsg.data);
            }
          } catch (e) {
            console.error('处理信令失败:', e);
          }
        });
      } catch (e) {
        console.error('监听信令失败:', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [friendId]);

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

    const service = getWebRTCService();
    if (!service || !service.isDataChannelOpen(friendId)) {
      message.error('连接未建立');
      return;
    }

    const success = service.sendMessage(friendId, inputText.trim());
    if (success) {
      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.trim(),
        isMine: true,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);
      setInputText('');
    } else {
      message.error('发送失败');
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

  const handleExit = async () => {
    try {
      const service = getWebRTCService();
      if (service) {
        await service.closeConnection(friendId);
      }
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      console.error('退出失败:', e);
      message.error('退出失败');
    }
  };

  const getStatusTag = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Tag color="success">已连接</Tag>;
      case 'connecting':
        return <Tag color="warning">连接中...</Tag>;
      case 'disconnected':
        return <Tag color="error">已断开</Tag>;
      case 'failed':
        return <Tag color="error">连接失败</Tag>;
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ApiOutlined className={styles.webrtcIcon} />
          <span className={styles.title}>WebRTC 聊天</span>
          {getStatusTag()}
        </div>
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
      <div className={styles.hint}>
        WebRTC P2P 直连聊天，消息不经过服务器，关闭窗口后消息将消失
      </div>
      <div ref={messageContainerRef} className={styles.messageContainer}>
        {connectionStatus === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin tip="正在建立连接..." />
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageItem} ${msg.isMine ? styles.mine : styles.friend}`}
          >
            <div>
              <div className={styles.messageBubble}>{msg.text}</div>
              <div className={styles.messageTime}>{formatTime(msg.timestamp)}</div>
            </div>
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
            disabled={connectionStatus !== 'connected'}
          />
          <Button
            type="primary"
            onClick={sendMessage}
            disabled={connectionStatus !== 'connected'}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WebRTCChat;
