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
import {
  clearWebRTCLogs,
  initWebRTCConsoleCapture,
  useWebRTCLogs,
} from '@/services/webrtcLog';
import { getWebRTCService, initWebRTCService } from '@/services/webrtcService';
import {
  ApiOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SendOutlined,
  SmileOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useIntl, useLocation } from '@umijs/max';
import { WebRTCSignalMessage } from '@workspace/types';
import { Button, Input, message, Spin, Tag, Tooltip } from 'antd';
import { nanoid } from 'nanoid';
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
  type: 'offer' | 'answer' | 'candidate' | 'end';
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
  const intl = useIntl();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';
  const isInitiator = params.get('initiator') === 'true';
  const localUserId = params.get('localUserId') || '';
  const initialSignalData = params.get('signalData');
  const urlSessionId = params.get('sessionId') || '';
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'failed'
  >('connecting');
  const [callStage, setCallStage] = useState<
    'incoming' | 'outgoing' | 'connecting' | 'connected' | 'rejected' | 'ended'
  >(isInitiator ? 'outgoing' : 'incoming');

  // 呼叫状态机：接通前(来电/去电/拒绝)仅显示呼叫提示界面
  const isPreCall =
    callStage === 'incoming' ||
    callStage === 'outgoing' ||
    callStage === 'rejected';
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeView, setActiveView] = useState<'video' | 'log'>('video');
  const webRTCLogs = useWebRTCLogs();
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 采集当前窗口与 WebRTC 相关的日志，用于日志 Tab 展示
  useEffect(() => {
    initWebRTCConsoleCapture();
  }, []);

  // 日志更新时自动滚到底部
  useEffect(() => {
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [webRTCLogs]);

  // 发送视频通话控制消息（12邀请/13接受/14拒绝/15结束）
  const sendControlMsg = async (text_type: number, type: string, sessionId: string) => {
    const msg: TextQuicMsgVo = {
      nano_id: nanoid(),
      text_type,
      raw: JSON.stringify({
        type,
        sender: localUserId,
        receiver: friendId,
        sessionId,
        timestamp: Date.now(),
      }),
      recv_user: friendId,
      send_user: localUserId,
      timestamp: Date.now(),
    };
    await invoke('send_text_msg', { textQuicMsg: msg });
  };

  // 发起方：发送邀请
  const sendInvite = async (sessionId: string) => {
    await sendControlMsg(12, 'invite', sessionId);
  };

  // 收到对方接受(13)后：创建 offer 并发送 100 信令
  const sendOffer = async () => {
    const service = getWebRTCService();
    if (!service) {
      console.error('[WebRTCChat] ❌ WebRTCService不存在，无法创建offer');
      return;
    }
    console.log(`[WebRTCChat] 对方已接受，创建offer... (friendId=${friendId})`);
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
    setCallStage('connecting');
    console.log(`[WebRTCChat] ✅ offer已发送，等待对端的answer和ICE候选...`);
  };

  // 被叫方：接受
  const handleAccept = async () => {
    const service = getWebRTCService();
    const sessionId = service?.sessionId || urlSessionId;
    await sendControlMsg(13, 'accept', sessionId);
    setCallStage('connecting');
  };

  // 被叫方/发起方：拒绝
  const handleReject = async () => {
    const service = getWebRTCService();
    const sessionId = service?.sessionId || urlSessionId;
    await sendControlMsg(14, 'reject', sessionId);
    setCallStage('rejected');
    // 短暂提示后自动关闭窗口
    setTimeout(() => closeWebRTCWindow(), 2000);
  };

  // 关闭当前WebRTC窗口（不发送结束信令，用于未接通时的退出）
  const closeWebRTCWindow = async () => {
    try {
      await updateWebRTCWindowState(friendId, 'close');
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      console.error('[WebRTCChat] 关闭窗口失败:', e);
    }
  };

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

      // 若通过邀请流程携带了 sessionId，则注入以保证双方使用同一会话
      if (urlSessionId) {
        service.sessionId = urlSessionId;
        console.log(`[WebRTCChat] 已注入会话ID: ${service.sessionId}`);
      }

      try {
        console.log(`[WebRTCChat] 初始化本地媒体流...`);
        const stream = await service.initLocalStream(true, true);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log(`[WebRTCChat] ✅ 本地视频流已绑定`);
        }
      } catch (error) {
        console.error(`[WebRTCChat] ❌ 初始化本地媒体流失败:`, error);
        message.warning(intl.formatMessage({ id: 'webrtc.mediaAccessError' }));
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
          senderName: intl.formatMessage({ id: 'webrtc.peer' }),
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
        console.log(`[WebRTCChat] 本端为发起方，发送视频通话邀请...`);
        try {
          await sendInvite(service.sessionId);
          console.log(`[WebRTCChat] ✅ 邀请已发送，等待对方接受...`);
        } catch (e) {
          console.error(`[WebRTCChat] ❌ 发送邀请失败:`, e);
          message.error(intl.formatMessage({ id: 'chat.footer.webRTCFailed' }));
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
          message.error(intl.formatMessage({ id: 'webrtc.signalProcessFailed' }));
        }
      } else {
        // 响应方：已接受后等待对端 offer 的常规路径，正常逻辑，无需告警
        setCallStage('incoming');
        console.log(
          `[WebRTCChat] 本端为响应方，等待对端同意后发送 offer（正常流程）`,
        );
      }
    };

    console.log(`[WebRTCChat] useEffect(initWebRTC) - 组件挂载，开始初始化`);
    initWebRTC();
  }, []);

  // 接通前呼叫提示阶段视频元素未挂载，此处于视频面板挂载时绑定本地/远程媒体流
  useEffect(() => {
    if (isPreCall) return;
    const service = getWebRTCService();
    if (!service) return;
    const local = service.getLocalStream();
    if (local && localVideoRef.current) {
      localVideoRef.current.srcObject = local;
    }
    const remote = service.getRemoteStream(friendId);
    if (remote && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remote;
    }
    const state = service.getConnectionState(friendId);
    if (state) {
      if (state === 'connected') {
        setConnectionStatus('connected');
      } else if (state === 'disconnected' || state === 'closed') {
        setConnectionStatus('disconnected');
      } else if (state === 'failed') {
        setConnectionStatus('failed');
      } else {
        setConnectionStatus('connecting');
      }
    }
  }, [isPreCall, friendId]);

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
            } else if (signalMsg.type === 'end') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的结束信令，关闭连接`,
              );
              setConnectionStatus('disconnected');
              await service.closeConnection(friendId);
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

  // 监听对方对通话邀请的回应：13=接受(发起offer)，14=拒绝
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('text_message', async (event) => {
          const text: TextQuicMsgVo = JSON.parse(event.payload);
          if (text.recv_user !== localUserId || text.send_user !== friendId) {
            return;
          }
          if (text.text_type === 13) {
            console.log(`[WebRTCChat] 收到对方接受通知，开始创建offer...`);
            try {
              await sendOffer();
            } catch (e) {
              console.error('[WebRTCChat] 创建offer失败:', e);
              message.error(intl.formatMessage({ id: 'webrtc.connectionCreateFailed' }));
            }
          } else if (text.text_type === 14) {
            console.log(`[WebRTCChat] 对方拒绝了通话请求`);
            setCallStage('rejected');
            setTimeout(() => closeWebRTCWindow(), 2000);
          }
        });
        console.log(`[WebRTCChat] ✅ 通话回应监听已设置`);
      } catch (e) {
        console.error(`[WebRTCChat] ❌ 设置通话回应监听失败:`, e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [friendId, localUserId]);

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
      message.error(intl.formatMessage({ id: 'webrtc.connectionNotEstablished' }));
      return;
    }

    if (!service.isDataChannelOpen(friendId)) {
      console.error(`[WebRTCChat.sendMessage] ❌ DataChannel未打开`);
      message.error(intl.formatMessage({ id: 'webrtc.connectionNotEstablished' }));
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
        senderName: intl.formatMessage({ id: 'webrtc.me' }),
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
      message.error(intl.formatMessage({ id: 'webrtc.sendFailed' }));
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
    console.log(`[WebRTCChat.handleRetry] 用户点击重试按钮，开始重试...`);
    setIsRetrying(true);
    setConnectionStatus('connecting');

    try {
      const service = getWebRTCService();
      if (!service) {
        console.error(`[WebRTCChat.handleRetry] WebRTCService不存在`);
        return;
      }

      console.log(`[WebRTCChat.handleRetry] 关闭旧连接...`);
      await service.closeConnection(friendId);

      if (isInitiator) {
        console.log(`[WebRTCChat.handleRetry] 发起方重试，重新创建offer...`);
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
        console.log(`[WebRTCChat.handleRetry] ✅ 重试offer已发送`);
      } else {
        console.log(`[WebRTCChat.handleRetry] 响应方等待对端的新offer...`);
      }
    } catch (e) {
      console.error(`[WebRTCChat.handleRetry] ❌ 重试失败:`, e);
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
          `[WebRTCChat.handleExit] 先发送结束信令，再关闭连接...`,
        );
        // 发送结束信令通知对端（对端会借此清理连接）
        try {
          const endSignal: WebRTCSignalMessage = {
            type: 'end',
            sender: localUserId,
            receiver: friendId,
            sessionId: service.sessionId,
            data: {},
            timestamp: Date.now(),
          };
          await service.sendSignal(endSignal);
          console.log(`[WebRTCChat.handleExit] ✅ 结束信令已发送`);
        } catch (sendEndErr) {
          console.error(`[WebRTCChat.handleExit] 发送结束信令失败:`, sendEndErr);
        }

        console.log(
          `[WebRTCChat.handleExit] 调用 service.closeConnection(${friendId})...`,
        );
        await service.closeConnection(friendId);
        console.log(`[WebRTCChat.handleExit] ✅ WebRTC连接已关闭`);
      } else {
        console.log(`[WebRTCChat.handleExit] ⚠️  WebRTCService不存在`);
      }

      console.log(`[WebRTCChat.handleExit] 清理后端窗口状态...`);
      await updateWebRTCWindowState(friendId, 'close');

      console.log(`[WebRTCChat.handleExit] 关闭当前窗口...`);
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
      console.log(`[WebRTCChat.handleExit] ✅ 窗口已关闭`);
    } catch (e) {
      console.error(`[WebRTCChat.handleExit] ❌ 退出失败:`, e);
      message.error(intl.formatMessage({ id: 'webrtc.exitFailed' }));
    }
  };

  const getStatusTag = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Tag color="success">{intl.formatMessage({ id: 'webrtc.connected' })}</Tag>;
      case 'connecting':
        return <Tag color="warning">{intl.formatMessage({ id: 'webrtc.connecting' })}</Tag>;
      case 'disconnected':
        return <Tag color="error">{intl.formatMessage({ id: 'webrtc.disconnected' })}</Tag>;
      case 'failed':
        return <Tag color="error">{intl.formatMessage({ id: 'webrtc.connectionFailed' })}</Tag>;
      default:
        return null;
    }
  };

  const renderMessage = (msg: ChatMessageItem) => {
    const displayName = msg.isMine
      ? `${msg.senderName || intl.formatMessage({ id: 'webrtc.me' })}(${intl.formatMessage({ id: 'webrtc.me' })})`
      : msg.senderName || intl.formatMessage({ id: 'webrtc.peer' });

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

  const renderCallScreen = () => {
    if (callStage === 'incoming') {
      return (
        <div className={styles.callScreen}>
          <div className={styles.callAvatar}>
            <VideoCameraOutlined />
          </div>
          <div className={styles.callTitle}>
            {intl.formatMessage({ id: 'webRTCMessage.inviteReceived' })}
          </div>
          <div className={styles.callActions}>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              size="large"
              onClick={() => handleAccept().catch(() => {})}
            >
              {intl.formatMessage({ id: 'webRTCMessage.acceptBtn' })}
            </Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              size="large"
              onClick={() => handleReject().catch(() => {})}
            >
              {intl.formatMessage({ id: 'webRTCMessage.rejectBtn' })}
            </Button>
          </div>
        </div>
      );
    }
    if (callStage === 'outgoing') {
      return (
        <div className={styles.callScreen}>
          <div className={styles.callAvatar}>
            <VideoCameraOutlined />
          </div>
          <div className={styles.callTitle}>
            {intl.formatMessage({ id: 'chat.footer.webRTCInviteSent' })}
          </div>
          <Spin />
        </div>
      );
    }
    // rejected
    return (
      <div className={styles.callScreen}>
        <div className={styles.callAvatar}>
          <VideoCameraOutlined />
        </div>
        <div className={styles.callTitle}>
          {intl.formatMessage({ id: 'webRTCMessage.rejected' })}
        </div>
      </div>
    );
  };

  const formatLogTime = (ts: number): string => {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(
      d.getMilliseconds(),
    ).padStart(3, '0')}`;
  };

  const logLevelClass = (level: string) => {
    if (level === 'warn') return styles.logWarn;
    if (level === 'error') return styles.logError;
    return styles.logInfo;
  };

  const renderLogPanel = () => (
    <div className={styles.logPanel}>
      <div className={styles.logHeader}>
        <span className={styles.logTitle}>
          {intl.formatMessage({ id: 'webrtc.logTitle' })}
        </span>
        <Button size="small" onClick={() => clearWebRTCLogs()}>
          {intl.formatMessage({ id: 'webrtc.clearLogs' })}
        </Button>
      </div>
      <div className={styles.logBody} ref={logContainerRef}>
        {webRTCLogs.length === 0 && (
          <div className={styles.logEmpty}>
            {intl.formatMessage({ id: 'webrtc.logEmpty' })}
          </div>
        )}
        {webRTCLogs.map((log) => (
          <div key={log.id} className={styles.logLine}>
            <span className={styles.logTime}>{formatLogTime(log.timestamp)}</span>
            <span className={`${styles.logLevel} ${logLevelClass(log.level)}`}>
              [{log.level.toUpperCase()}]
            </span>
            <span className={styles.logMessage}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ApiOutlined className={styles.webrtcIcon} />
          <span className={styles.title}>{intl.formatMessage({ id: 'webrtc.videoChat' })}</span>
          {getStatusTag()}
        </div>
        <div className={styles.viewTabs}>
          <span
            className={`${styles.viewTab} ${activeView === 'video' ? styles.viewTabActive : ''}`}
            onClick={() => setActiveView('video')}
          >
            {intl.formatMessage({ id: 'webrtc.videoTab' })}
          </span>
          <span
            className={`${styles.viewTab} ${activeView === 'log' ? styles.viewTabActive : ''}`}
            onClick={() => setActiveView('log')}
          >
            {intl.formatMessage({ id: 'webrtc.logTab' })}
          </span>
        </div>
        <div className={styles.headerButtons}>
          <Button
            className={styles.exitBtn}
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleExit}
          >
            {intl.formatMessage({ id: 'webrtc.exit' })}
          </Button>
        </div>
      </div>

      {activeView === 'log' ? (
        renderLogPanel()
      ) : isPreCall ? (
        renderCallScreen()
      ) : (
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
              <div className={styles.videoLabel}>{intl.formatMessage({ id: 'webrtc.remote' })}</div>
            </div>
            <div className={styles.localVideoContainer}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={styles.localVideo}
              />
              <div className={styles.videoLabel}>{intl.formatMessage({ id: 'webrtc.local' })}</div>
            </div>
          </div>

          <div className={styles.mediaControls}>
            <Tooltip title={intl.formatMessage({ id: 'webrtc.closeCamera' })}>
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
            <Tooltip title={intl.formatMessage({ id: 'webrtc.openCamera' })}>
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
            <Tooltip title={intl.formatMessage({ id: 'webrtc.closeMicrophone' })}>
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
            <Tooltip title={intl.formatMessage({ id: 'webrtc.openMicrophone' })}>
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
            {intl.formatMessage({ id: 'webrtc.p2pChatHint' })}
          </div>
          <div ref={messageContainerRef} className={styles.messageContainer}>
            {connectionStatus === 'failed' && (
              <div className={styles.retryContainer}>
                <div className={styles.retryText}>{intl.formatMessage({ id: 'webrtc.connectionFailed' })}</div>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={isRetrying}
                  onClick={handleRetry}
                >
                  {intl.formatMessage({ id: 'webrtc.retryConnection' })}
                </Button>
              </div>
            )}
            {connectionStatus === 'connecting' && (
              <div className={styles.connectingContainer}>
                <Spin />
                <span className={styles.connectingText}>
                  {intl.formatMessage({ id: 'webrtc.establishingConnection' })}
                </span>
              </div>
            )}
            {messages.map(renderMessage)}
          </div>
          <div className={styles.footer}>
            <div className={styles.toolbar}>
              <div className={styles.emojiWrapper} ref={emojiPickerRef}>
                <Tooltip title={intl.formatMessage({ id: 'webrtc.emoji' })}>
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
                placeholder={intl.formatMessage({ id: 'webrtc.inputMessage' })}
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
      )}
    </div>
  );
};

export default WebRTCChat;
