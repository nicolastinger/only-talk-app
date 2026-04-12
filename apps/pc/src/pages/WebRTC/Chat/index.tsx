/**
 * WebRTC P2P 聊天组件
 *
 * 功能说明：
 * 这是一个独立的WebRTC P2P聊天窗口组件，用于两个用户之间的直连文本通信
 * - 消息不经过服务器，直接通过P2P连接传输
 * - 支持发起方(initiator)和响应方(responder)两种角色
 * - 通过WebRTC的offer/answer/candidate信令完成连接建立
 * - 使用RTCDataChannel传输实际的聊天消息
 *
 * URL参数：
 * - friendId: 对端用户ID
 * - initiator: 'true'表示发起方，'false'表示响应方
 * - localUserId: 当前用户ID
 * - signalData: 初始信令数据(仅响应方需要，包含对端的offer)
 *
 * 布局说明：
 * - 视频区域占80%宽度
 * - 聊天消息区域占20%宽度
 * - 所有消息都在右侧渲染
 */

import { updateWebRTCWindowState } from '@/hooks/useWebRTCSignalApi';
import { getWebRTCService, initWebRTCService } from '@/services/webrtcService';
import {
  ApiOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SendOutlined,
  SmileOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { window } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { useLocation } from '@umijs/max';
import { WebRTCSignalMessage } from '@workspace/types';
import { Button, Input, message, Spin, Tag, Tooltip } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from './index.less';

const { TextArea } = Input;

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

interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
  senderName?: string;
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
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'failed'
  >('connecting');
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
    const initWebRTC = async () => {
      console.log(`[WebRTCChat] 开始初始化WebRTC连接...`);
      console.log(
        `[WebRTCChat] 参数 - friendId: ${friendId}, isInitiator: ${isInitiator}, localUserId: ${localUserId}`,
      );

      const service = initWebRTCService(localUserId);
      console.log(
        `[WebRTCChat] WebRTCService已初始化，会话ID: ${service.sessionId}`,
      );

      try {
        console.log(`[WebRTCChat] 初始化本地媒体流...`);
        const stream = await service.initLocalStream(true, true);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log(`[WebRTCChat] ✅ 本地视频流已绑定`);
        }
      } catch (error) {
        console.error(`[WebRTCChat] ❌ 初始化本地媒体流失败:`, error);
        message.warning('无法访问摄像头或麦克风，视频聊天功能可能受限');
      }

      service.setOnRemoteStreamCallback(
        (fromFriendId: string, stream: MediaStream) => {
          console.log(
            `[WebRTCChat.onRemoteStreamCallback] 收到来自${fromFriendId}的远程媒体流`,
          );
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            console.log(
              `[WebRTCChat.onRemoteStreamCallback] ✅ 远程视频流已绑定`,
            );
          }
        },
      );

      service.setOnMessageCallback((fromFriendId: string, msg: string) => {
        console.log(
          `[WebRTCChat.onMessageCallback] 收到来自${fromFriendId}的消息: ${msg}`,
        );
        const newMessage: ChatMessageItem = {
          id: `${Date.now()}_${Math.random()}`,
          text: msg,
          isMine: false,
          timestamp: Date.now(),
          senderName: '对方',
        };
        setMessages((prev) => [...prev, newMessage]);
      });
      console.log(`[WebRTCChat] 消息回调已设置`);

      service.setOnConnectionStateChange(
        (fromFriendId: string, state: RTCPeerConnectionState) => {
          console.log(
            `[WebRTCChat.onConnectionStateChange] 连接状态变化: ${state}`,
          );
          if (state === 'connected') {
            setConnectionStatus('connected');
            console.log(`[WebRTCChat] ✅ P2P连接已建立，可以开始聊天`);
          } else if (state === 'disconnected' || state === 'closed') {
            setConnectionStatus('disconnected');
            console.log(`[WebRTCChat] ⚠️  连接已断开`);
          } else if (state === 'failed') {
            setConnectionStatus('failed');
            console.log(`[WebRTCChat] ❌ 连接失败`);
          }
        },
      );
      console.log(`[WebRTCChat] 连接状态回调已设置`);

      if (isInitiator) {
        console.log(`[WebRTCChat] 本端为发起方，创建offer...`);
        try {
          console.log(`[WebRTCChat] 调用 service.createOffer(${friendId})...`);
          const offer = await service.createOffer(friendId);
          console.log(`[WebRTCChat] offer创建成功`);

          const signalMessage: WebRTCSignalMessage = {
            type: 'offer',
            sender: localUserId,
            receiver: friendId,
            sessionId: service.sessionId,
            data: offer,
            timestamp: Date.now(),
          };
          console.log(`[WebRTCChat] offer信令消息已构建，准备发送...`);

          console.log(`[WebRTCChat] 调用 service.sendSignal()...`);
          await service.sendSignal(signalMessage);
          console.log(
            `[WebRTCChat] ✅ offer已发送，等待对端的answer和ICE候选...`,
          );
        } catch (e) {
          console.error(`[WebRTCChat] ❌ 创建offer失败:`, e);
          message.error('创建连接失败');
        }
      } else if (initialSignalData) {
        console.log(`[WebRTCChat] 本端为响应方，处理对端的offer...`);
        try {
          console.log(`[WebRTCChat] 解析URL参数中的signalData...`);
          const signalMsg: WebRTCSignalMsgRaw = JSON.parse(
            decodeURIComponent(initialSignalData),
          );
          console.log(
            `[WebRTCChat] signalData解析成功，类型: ${signalMsg.type}`,
          );

          if (signalMsg.type === 'offer') {
            console.log(`[WebRTCChat] 调用 service.handleOffer()...`);
            const answer = await service.handleOffer(friendId, signalMsg.data);
            console.log(`[WebRTCChat] answer创建成功`);

            const responseSignal: WebRTCSignalMessage = {
              type: 'answer',
              sender: localUserId,
              receiver: friendId,
              sessionId: signalMsg.sessionId,
              data: answer,
              timestamp: Date.now(),
            };
            console.log(`[WebRTCChat] answer信令消息已构建，准备发送...`);

            console.log(`[WebRTCChat] 调用 service.sendSignal()...`);
            await service.sendSignal(responseSignal);
            console.log(
              `[WebRTCChat] ✅ answer已发送，等待ICE候选和连接建立...`,
            );
          }
        } catch (e) {
          console.error(`[WebRTCChat] ❌ 处理初始信令失败:`, e);
          message.error('处理初始信令失败');
        }
      } else {
        console.log(
          `[WebRTCChat] ⚠️  既不是发起方也没有initialSignalData，可能是异常状态`,
        );
      }
    };

    console.log(`[WebRTCChat] useEffect(initWebRTC) - 组件挂载，开始初始化`);
    initWebRTC();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        console.log(
          `[WebRTCChat] useEffect(setupListener) - 开始设置信令事件监听...`,
        );

        unlisten = await listen<string>('webrtc_signal', async (event) => {
          console.log(`[WebRTCChat.onWebRTCSignal] 📡 收到WebRTC信令事件`);
          try {
            const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
            console.log(
              `[WebRTCChat.onWebRTCSignal] QUIC消息已解析 - nano_id: ${msgVo.nano_id}, text_type: ${msgVo.text_type}`,
            );

            const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw);
            console.log(
              `[WebRTCChat.onWebRTCSignal] 信令消息已解析 - 类型: ${signalMsg.type}, 发送方: ${signalMsg.sender}, sessionId: ${signalMsg.sessionId}`,
            );

            if (signalMsg.sender !== friendId) {
              console.log(
                `[WebRTCChat.onWebRTCSignal] ⚠️  忽略来自非目标用户(${signalMsg.sender})的消息`,
              );
              return;
            }

            const service = getWebRTCService();
            if (!service) {
              console.error(
                `[WebRTCChat.onWebRTCSignal] ❌ WebRTCService不存在`,
              );
              return;
            }

            if (signalMsg.type === 'answer') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的answer，正在处理...`,
              );
              await service.handleAnswer(friendId, signalMsg.data);
              console.log(`[WebRTCChat.onWebRTCSignal] ✅ answer已处理`);
            } else if (signalMsg.type === 'offer') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的offer（可能是ICE重启），正在处理...`,
              );
              try {
                const restartAnswer = await service.handleOffer(
                  friendId,
                  signalMsg.data,
                );
                console.log(`[WebRTCChat.onWebRTCSignal] ICE重启answer已创建`);

                const responseSignal: WebRTCSignalMessage = {
                  type: 'answer',
                  sender: localUserId,
                  receiver: friendId,
                  sessionId: signalMsg.sessionId,
                  data: restartAnswer,
                  timestamp: Date.now(),
                };
                await service.sendSignal(responseSignal);
                console.log(
                  `[WebRTCChat.onWebRTCSignal] ✅ ICE重启answer已发送`,
                );
              } catch (e) {
                console.error(
                  `[WebRTCChat.onWebRTCSignal] ❌ 处理ICE重启offer失败:`,
                  e,
                );
              }
            } else if (signalMsg.type === 'candidate') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的ICE candidate`,
              );
              await service.handleCandidate(friendId, signalMsg.data);
              console.log(`[WebRTCChat.onWebRTCSignal] ✅ candidate已处理`);
            } else {
              console.log(
                `[WebRTCChat.onWebRTCSignal] ⚠️  未知的信令类型: ${signalMsg.type}`,
              );
            }
          } catch (e) {
            console.error(`[WebRTCChat.onWebRTCSignal] ❌ 处理信令失败:`, e);
          }
        });

        console.log(`[WebRTCChat] ✅ 信令事件监听已设置`);
      } catch (e) {
        console.error(`[WebRTCChat] ❌ 设置信令监听失败:`, e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log(`[WebRTCChat] useEffect cleanup - 取消信令事件监听`);
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

  const handleEmojiClick = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const sendMessage = async () => {
    console.log(
      `[WebRTCChat.sendMessage] 准备发送消息，输入内容: "${inputText}"`,
    );

    if (!inputText.trim()) {
      console.log(`[WebRTCChat.sendMessage] ⚠️  输入为空，取消发送`);
      return;
    }

    const service = getWebRTCService();

    if (!service) {
      console.error(`[WebRTCChat.sendMessage] ❌ WebRTCService不存在`);
      message.error('连接未建立');
      return;
    }

    if (!service.isDataChannelOpen(friendId)) {
      console.error(`[WebRTCChat.sendMessage] ❌ DataChannel未打开`);
      message.error('连接未建立');
      return;
    }

    console.log(
      `[WebRTCChat.sendMessage] ✅ 连接就绪，调用 service.sendMessage()...`,
    );

    const success = service.sendMessage(friendId, inputText.trim());
    if (success) {
      console.log(
        `[WebRTCChat.sendMessage] ✅ 消息发送成功，添加到本地消息列表`,
      );

      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.trim(),
        isMine: true,
        timestamp: Date.now(),
        senderName: '我',
      };
      setMessages((prev) => [...prev, newMessage]);
      console.log(
        `[WebRTCChat.sendMessage] 消息已添加到UI，当前消息总数: ${
          messages.length + 1
        }`,
      );
      setInputText('');
    } else {
      console.error(`[WebRTCChat.sendMessage] ❌ 消息发送失败`);
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

  const handleToggleVideo = () => {
    const service = getWebRTCService();
    if (service) {
      const enabled = service.toggleVideo();
      setIsVideoEnabled(enabled);
      console.log(`[WebRTCChat] 视频状态切换为: ${enabled ? '开启' : '关闭'}`);
    }
  };

  const handleToggleAudio = () => {
    const service = getWebRTCService();
    if (service) {
      const enabled = service.toggleAudio();
      setIsAudioEnabled(enabled);
      console.log(`[WebRTCChat] 音频状态切换为: ${enabled ? '开启' : '关闭'}`);
    }
  };

  const handleRetry = async () => {
    console.log(
      `[WebRTCChat.handleRetry] 用户点击重试按钮，开始重试...`,
    );
    setIsRetrying(true);
    setConnectionStatus('connecting');

    try {
      const service = getWebRTCService();
      if (!service) {
        console.error(
          `[WebRTCChat.handleRetry] WebRTCService不存在`,
        );
        return;
      }

      console.log(`[WebRTCChat.handleRetry] 关闭旧连接...`);
      await service.closeConnection(friendId);

      if (isInitiator) {
        console.log(
          `[WebRTCChat.handleRetry] 发起方重试，重新创建offer...`,
        );
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
        console.log(
          `[WebRTCChat.handleRetry] ✅ 重试offer已发送`,
        );
      } else {
        console.log(
          `[WebRTCChat.handleRetry] 响应方等待对端的新offer...`,
        );
      }
    } catch (e) {
      console.error(
        `[WebRTCChat.handleRetry] ❌ 重试失败:`,
        e,
      );
      setConnectionStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleExit = async () => {
    console.log(`[WebRTCChat.handleExit] 用户点击退出按钮，开始清理资源...`);

    try {
      const service = getWebRTCService();
      if (service) {
        console.log(
          `[WebRTCChat.handleExit] 调用 service.closeConnection(${friendId})...`,
        );
        await service.closeConnection(friendId);
        console.log(`[WebRTCChat.handleExit] ✅ WebRTC连接已关闭`);
      } else {
        console.log(`[WebRTCChat.handleExit] ⚠️  WebRTCService不存在`);
      }

      console.log(
        `[WebRTCChat.handleExit] 清理后端窗口状态...`,
      );
      await updateWebRTCWindowState(friendId, 'close');

      console.log(
        `[WebRTCChat.handleExit] 关闭当前窗口...`,
      );
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
      console.log(`[WebRTCChat.handleExit] ✅ 窗口已关闭`);
    } catch (e) {
      console.error(`[WebRTCChat.handleExit] ❌ 退出失败:`, e);
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

  const renderMessage = (msg: ChatMessageItem) => {
    const displayName = msg.isMine
      ? `${msg.senderName || '我'}(我)`
      : msg.senderName || '对方';

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
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ApiOutlined className={styles.webrtcIcon} />
          <span className={styles.title}>WebRTC 视频聊天</span>
          {getStatusTag()}
        </div>
        <div className={styles.headerButtons}>
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

      <div className={styles.mainContent}>
        <div className={styles.videoPanel}>
          <div className={styles.videoWrapper}>
            <div className={styles.videoContainer}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={styles.remoteVideo}
              />
              <div className={styles.videoLabel}>远程</div>
            </div>
            <div className={styles.localVideoContainer}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={styles.localVideo}
              />
              <div className={styles.videoLabel}>本地</div>
            </div>
          </div>

          <div className={styles.mediaControls}>
            <Tooltip title={isVideoEnabled ? '关闭摄像头' : '开启摄像头'}>
              <Button
                type={isVideoEnabled ? 'primary' : 'default'}
                danger={!isVideoEnabled}
                icon={
                  isVideoEnabled ? (
                    <VideoCameraOutlined />
                  ) : (
                    <VideoCameraAddOutlined />
                  )
                }
                onClick={handleToggleVideo}
                size="large"
                shape="circle"
              />
            </Tooltip>
            <Tooltip title={isAudioEnabled ? '关闭麦克风' : '开启麦克风'}>
              <Button
                type={isAudioEnabled ? 'primary' : 'default'}
                danger={!isAudioEnabled}
                icon={
                  isAudioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />
                }
                onClick={handleToggleAudio}
                size="large"
                shape="circle"
              />
            </Tooltip>
          </div>
        </div>

        <div className={styles.chatPanel}>
          <div className={styles.hint}>
            WebRTC P2P 直连聊天，消息不经过服务器，关闭窗口后消息将消失
          </div>
          <div ref={messageContainerRef} className={styles.messageContainer}>
            {connectionStatus === 'failed' && (
              <div className={styles.retryContainer}>
                <div className={styles.retryText}>连接失败</div>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={isRetrying}
                  onClick={handleRetry}
                >
                  重试连接
                </Button>
              </div>
            )}
            {connectionStatus === 'connecting' && (
              <div className={styles.connectingContainer}>
                <Spin tip="正在建立连接..." />
              </div>
            )}
            {messages.map(renderMessage)}
          </div>
          <div className={styles.footer}>
            <div className={styles.toolbar}>
              <div className={styles.emojiWrapper} ref={emojiPickerRef}>
                <Tooltip title="表情">
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
                onChange={(e: any) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入消息..."
                autoSize={{ minRows: 1, maxRows: 3 }}
                disabled={connectionStatus !== 'connected'}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                disabled={connectionStatus !== 'connected'}
                className={styles.sendBtn}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebRTCChat;
