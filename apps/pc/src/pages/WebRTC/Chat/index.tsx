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
 */

import { updateWebRTCWindowState } from '@/hooks/useWebRTCSignalApi';
import { getWebRTCService, initWebRTCService } from '@/services/webrtcService';
import {
  ApiOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  LogoutOutlined,
  ReloadOutlined,
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

/**
 * 聊天消息项接口
 */
interface ChatMessageItem {
  /** 消息唯一ID */
  id: string;
  /** 消息文本内容 */
  text: string;
  /** 是否为当前用户的消息 */
  isMine: boolean;
  /** 消息生成时间戳 */
  timestamp: number;
}

/**
 * WebRTC信令消息原始格式
 * 从QUIC消息中解析出的实际信令内容
 */
interface WebRTCSignalMsgRaw {
  /** 信令类型 */
  type: 'offer' | 'answer' | 'candidate';
  /** 发送方ID */
  sender: string;
  /** 接收方ID */
  receiver: string;
  /** 会话ID */
  sessionId: string;
  /** 具体数据 */
  data: any;
  /** 时间戳 */
  timestamp: number;
}

/**
 * QUIC 文本消息包装格式
 * 信令消息通过此结构在QUIC层传输
 */
interface TextQuicMsgVo {
  /** 消息唯一标识 */
  nano_id: string;
  /** 消息类型: 100表示WebRTC信令 */
  text_type: number;
  /** JSON序列化的信令内容 */
  raw: string;
  /** 接收方用户ID */
  recv_user: string;
  /** 发送方用户ID */
  send_user: string;
  /** 消息时间戳 */
  timestamp: number;
}

const WebRTCChat: React.FC = () => {
  // ============ 状态管理 ============
  /** 聊天消息列表 */
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  /** 用户输入的文本 */
  const [inputText, setInputText] = useState('');
  /** 连接状态: connecting | connected | disconnected | failed */
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'failed'
  >('connecting');
  /** 消息容器DOM引用，用于自动滚动 */
  const messageContainerRef = useRef<HTMLDivElement>(null);
  /** 本地视频元素引用 */
  const localVideoRef = useRef<HTMLVideoElement>(null);
  /** 远程视频元素引用 */
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  /** 视频是否开启 */
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  /** 音频是否开启 */
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  /** \u662f\u5426\u663e\u793a\u89c6\u9891\u533a\u57df */
  const [showVideoPanel, setShowVideoPanel] = useState(true);
  /** \u662f\u5426\u6b63\u5728\u91cd\u8bd5\u8fde\u63a5 */
  const [isRetrying, setIsRetrying] = useState(false);

  // ============ 从URL参数获取信息 ============
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  /** 对端用户ID */
  const friendId = params.get('friendId') || '';
  /** 是否为发起方 (true=发起方发送offer, false=响应方发送answer) */
  const isInitiator = params.get('initiator') === 'true';
  /** 当前用户ID */
  const localUserId = params.get('localUserId') || '';
  /** 初始信令数据(仅响应方需要，包含对端的offer) */
  const initialSignalData = params.get('signalData');

  /**
   * 效果1: 自动滚动到底部
   * 每次消息列表更新时自动滚动消息容器到底部
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * 效果2: WebRTC连接初始化
   *
   * 流程：
   * 1. 初始化WebRTC服务，设置回调
   * 2. 如果是发起方:
   *    - 创建offer
   *    - 发送offer给对端
   * 3. 如果是响应方:
   *    - 从URL参数解析对端的offer
   *    - 处理offer并创建answer
   *    - 发送answer给对端
   * 4. 后续通过监听器处理answer和candidate消息
   */
  useEffect(() => {
    const initWebRTC = async () => {
      console.log(`[WebRTCChat] 开始初始化WebRTC连接...`);
      console.log(
        `[WebRTCChat] 参数 - friendId: ${friendId}, isInitiator: ${isInitiator}, localUserId: ${localUserId}`,
      );

      // 初始化或获取WebRTC服务实例
      const service = initWebRTCService(localUserId);
      console.log(
        `[WebRTCChat] WebRTCService已初始化，会话ID: ${service.sessionId}`,
      );

      /**
       * 初始化本地媒体流
       */
      try {
        console.log(`[WebRTCChat] 初始化本地媒体流...`);
        const stream = await service.initLocalStream(true, true);

        // 将本地流绑定到视频元素
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log(`[WebRTCChat] ✅ 本地视频流已绑定`);
        }
      } catch (error) {
        console.error(`[WebRTCChat] ❌ 初始化本地媒体流失败:`, error);
        message.warning('无法访问摄像头或麦克风，视频聊天功能可能受限');
      }

      /**
       * 设置远程媒体流接收回调
       */
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

      /**
       * 设置消息接收回调
       * 当对端通过DataChannel发送消息时触发
       */
      service.setOnMessageCallback((fromFriendId: string, msg: string) => {
        console.log(
          `[WebRTCChat.onMessageCallback] 收到来自${fromFriendId}的消息: ${msg}`,
        );
        const newMessage: ChatMessageItem = {
          id: `${Date.now()}_${Math.random()}`,
          text: msg,
          isMine: false, // 来自对端的消息
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
      });
      console.log(`[WebRTCChat] 消息回调已设置`);

      /**
       * 设置连接状态变化回调
       * 当RTCPeerConnection的状态发生变化时触发
       */
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
            console.log(`[WebRTCChat] \u274c \u8fde\u63a5\u5931\u8d25`);
            // \u8fde\u63a5\u5931\u8d25\u65f6\u4e0d\u5173\u95ed\u7a97\u53e3\uff0c\u663e\u793a\u91cd\u8bd5\u6309\u94ae\u8ba9\u7528\u6237\u624b\u52a8\u91cd\u8bd5
          }
        },
      );
      console.log(`[WebRTCChat] 连接状态回调已设置`);

      /**
       * 发起方流程：创建offer并发送
       */
      if (isInitiator) {
        console.log(`[WebRTCChat] 本端为发起方，创建offer...`);
        try {
          // 创建offer，包含本端的媒体能力和DataChannel
          console.log(`[WebRTCChat] 调用 service.createOffer(${friendId})...`);
          const offer = await service.createOffer(friendId);
          console.log(`[WebRTCChat] offer创建成功`);

          // 构建信令消息
          const signalMessage: WebRTCSignalMessage = {
            type: 'offer',
            sender: localUserId,
            receiver: friendId,
            sessionId: service.sessionId,
            data: offer,
            timestamp: Date.now(),
          };
          console.log(`[WebRTCChat] offer信令消息已构建，准备发送...`);

          // 通过QUIC信令通道发送offer给对端
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
        /**
         * 响应方流程：处理offer并发送answer
         */
        console.log(`[WebRTCChat] 本端为响应方，处理对端的offer...`);
        try {
          // 从URL参数解析对端的offer
          console.log(`[WebRTCChat] 解析URL参数中的signalData...`);
          const signalMsg: WebRTCSignalMsgRaw = JSON.parse(
            decodeURIComponent(initialSignalData),
          );
          console.log(
            `[WebRTCChat] signalData解析成功，类型: ${signalMsg.type}`,
          );

          if (signalMsg.type === 'offer') {
            // 处理offer: 设置远程描述并创建answer
            console.log(`[WebRTCChat] 调用 service.handleOffer()...`);
            const answer = await service.handleOffer(friendId, signalMsg.data);
            console.log(`[WebRTCChat] answer创建成功`);

            // 构建answer信令消息
            const responseSignal: WebRTCSignalMessage = {
              type: 'answer',
              sender: localUserId,
              receiver: friendId,
              sessionId: signalMsg.sessionId, // 使用相同的sessionId保持会话关联
              data: answer,
              timestamp: Date.now(),
            };
            console.log(`[WebRTCChat] answer信令消息已构建，准备发送...`);

            // 发送answer给对端
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
  }, []); // 仅在组件挂载时执行一次

  /**
   * 效果3: 监听信令消息事件
   *
   * 监听来自Tauri后端的 'webrtc_signal' 事件
   * 当对端发送answer或candidate消息时由后端转发到此处
   *
   * 消息流：
   * 对端 ---> Rust后端(QUIC) ---> emit('webrtc_signal') ---> 前端监听
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        console.log(
          `[WebRTCChat] useEffect(setupListener) - 开始设置信令事件监听...`,
        );

        // 监听 'webrtc_signal' 事件，接收对端的answer和candidate消息
        unlisten = await listen<string>('webrtc_signal', async (event) => {
          console.log(`[WebRTCChat.onWebRTCSignal] 📡 收到WebRTC信令事件`);
          try {
            // 解析事件数据: QUIC消息格式 -> 信令消息格式
            const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
            console.log(
              `[WebRTCChat.onWebRTCSignal] QUIC消息已解析 - nano_id: ${msgVo.nano_id}, text_type: ${msgVo.text_type}`,
            );

            const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw);
            console.log(
              `[WebRTCChat.onWebRTCSignal] 信令消息已解析 - 类型: ${signalMsg.type}, 发送方: ${signalMsg.sender}, sessionId: ${signalMsg.sessionId}`,
            );

            // 仅处理来自对端的消息
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

            /**
             * 处理answer信令
             * 仅发起方需要处理answer
             */
            if (signalMsg.type === 'answer') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的answer，正在处理...`,
              );
              await service.handleAnswer(friendId, signalMsg.data);
              console.log(`[WebRTCChat.onWebRTCSignal] ✅ answer已处理`);
            } else if (signalMsg.type === 'offer') {
              /**
               * 处理offer信令（ICE重启场景）
               * 当对端发起ICE重启时，会发送新的offer
               * 需要处理该offer并返回新的answer
               */
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的offer（可能是ICE重启），正在处理...`,
              );
              try {
                const restartAnswer = await service.handleOffer(
                  friendId,
                  signalMsg.data,
                );
                console.log(`[WebRTCChat.onWebRTCSignal] ICE重启answer已创建`);

                // 发送answer给对端
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
              /**
               * 处理candidate信令
               * 双方都需要处理candidate来建立完整的连接
               */
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

    // 清理函数：取消事件监听
    return () => {
      if (unlisten) {
        console.log(`[WebRTCChat] useEffect cleanup - 取消信令事件监听`);
        unlisten();
      }
    };
  }, [friendId]);

  /**
   * 滚动消息容器到底部
   * 用于实时显示最新消息
   */
  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  /**
   * 发送消息
   *
   * 流程：
   * 1. 检查输入内容和连接状态
   * 2. 通过DataChannel发送消息
   * 3. 添加到本地消息列表
   * 4. 清空输入框
   */
  const sendMessage = async () => {
    console.log(
      `[WebRTCChat.sendMessage] 准备发送消息，输入内容: "${inputText}"`,
    );

    // 检查是否有输入内容
    if (!inputText.trim()) {
      console.log(`[WebRTCChat.sendMessage] ⚠️  输入为空，取消发送`);
      return;
    }

    const service = getWebRTCService();

    // 检查连接是否已建立
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

    // 通过DataChannel发送消息
    const success = service.sendMessage(friendId, inputText.trim());
    if (success) {
      console.log(
        `[WebRTCChat.sendMessage] ✅ 消息发送成功，添加到本地消息列表`,
      );

      // 添加到本地消息列表
      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.trim(),
        isMine: true, // 本端发送的消息
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);
      console.log(
        `[WebRTCChat.sendMessage] 消息已添加到UI，当前消息总数: ${
          messages.length + 1
        }`,
      );
      setInputText(''); // 清空输入框
    } else {
      console.error(`[WebRTCChat.sendMessage] ❌ 消息发送失败`);
      message.error('发送失败');
    }
  };

  /**
   * 格式化时间戳为HH:mm格式
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  /**
   * 键盘事件处理
   * Enter键发送，Shift+Enter换行
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * 切换视频状态
   */
  const handleToggleVideo = () => {
    const service = getWebRTCService();
    if (service) {
      const enabled = service.toggleVideo();
      setIsVideoEnabled(enabled);
      console.log(`[WebRTCChat] 视频状态切换为: ${enabled ? '开启' : '关闭'}`);
    }
  };

  /**
   * 切换音频状态
   */
  const handleToggleAudio = () => {
    const service = getWebRTCService();
    if (service) {
      const enabled = service.toggleAudio();
      setIsAudioEnabled(enabled);
      console.log(`[WebRTCChat] 音频状态切换为: ${enabled ? '开启' : '关闭'}`);
    }
  };

  /**
   * 切换视频面板显示
   */
  const handleToggleVideoPanel = () => {
    setShowVideoPanel(!showVideoPanel);
  };

  /**
   * \u5728\u539f\u7a97\u53e3\u5185\u91cd\u8bd5\u8fde\u63a5
   *
   * \u6d41\u7a0b\uff1a
   * 1. \u5173\u95ed\u73b0\u6709\u8fde\u63a5\n   * 2. \u91cd\u65b0\u521b\u5efaoffer\u5e76\u53d1\u9001\n   * 3. \u4e0d\u5f00\u65b0\u7a97\u53e3\uff0c\u5728\u540c\u4e00\u7a97\u53e3\u5185\u5b8c\u6210\u91cd\u8bd5
   */
  const handleRetry = async () => {
    console.log(
      `[WebRTCChat.handleRetry] \u7528\u6237\u70b9\u51fb\u91cd\u8bd5\u6309\u94ae\uff0c\u5f00\u59cb\u91cd\u8bd5...`,
    );
    setIsRetrying(true);
    setConnectionStatus('connecting');

    try {
      const service = getWebRTCService();
      if (!service) {
        console.error(
          `[WebRTCChat.handleRetry] WebRTCService\u4e0d\u5b58\u5728`,
        );
        return;
      }

      // \u5173\u95ed\u65e7\u8fde\u63a5\n      console.log(`[WebRTCChat.handleRetry] \u5173\u95ed\u65e7\u8fde\u63a5...`);
      await service.closeConnection(friendId);

      if (isInitiator) {
        // \u53d1\u8d77\u65b9\u91cd\u8bd5\uff1a\u91cd\u65b0\u521b\u5efaoffer
        console.log(
          `[WebRTCChat.handleRetry] \u53d1\u8d77\u65b9\u91cd\u8bd5\uff0c\u91cd\u65b0\u521b\u5efaoffer...`,
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
          `[WebRTCChat.handleRetry] \u2705 \u91cd\u8bd5offer\u5df2\u53d1\u9001`,
        );
      } else {
        // \u54cd\u5e94\u65b9\u91cd\u8bd5\uff1a\u7b49\u5f85\u5bf9\u7aef\u7684\u65b0offer
        console.log(
          `[WebRTCChat.handleRetry] \u54cd\u5e94\u65b9\u7b49\u5f85\u5bf9\u7aef\u7684\u65b0offer...`,
        );
        // \u54cd\u5e94\u65b9\u4e0d\u9700\u8981\u4e3b\u52a8\u53d1\u8d77\uff0c\u7b49\u5f85\u53d1\u8d77\u65b9\u7684ICE\u91cd\u542foffer\u5373\u53ef
      }
    } catch (e) {
      console.error(
        `[WebRTCChat.handleRetry] \u274c \u91cd\u8bd5\u5931\u8d25:`,
        e,
      );
      setConnectionStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  /**
   * \u9000\u51fa\u804a\u5929
   *
   * \u6d41\u7a0b\uff1a
   * 1. \u5173\u95edWebRTC\u8fde\u63a5
   * 2. \u6e05\u7406\u540e\u7aef\u7a97\u53e3\u72b6\u6001
   * 3. \u5173\u95ed\u5f53\u524d\u7a97\u53e3
   */
  const handleExit = async () => {
    console.log(`[WebRTCChat.handleExit] 用户点击退出按钮，开始清理资源...`);

    try {
      const service = getWebRTCService();
      if (service) {
        console.log(
          `[WebRTCChat.handleExit] 调用 service.closeConnection(${friendId})...`,
        );
        // 清理WebRTC连接资源
        await service.closeConnection(friendId);
        console.log(`[WebRTCChat.handleExit] ✅ WebRTC连接已关闭`);
      } else {
        console.log(`[WebRTCChat.handleExit] ⚠️  WebRTCService不存在`);
      }

      // \u6e05\u7406\u540e\u7aef\u7a97\u53e3\u72b6\u6001
      console.log(
        `[WebRTCChat.handleExit] \u6e05\u7406\u540e\u7aef\u7a97\u53e3\u72b6\u6001...`,
      );
      await updateWebRTCWindowState(friendId, 'close');

      // \u5173\u95ed\u5f53\u524d\u7a97\u53e3
      console.log(
        `[WebRTCChat.handleExit] \u5173\u95ed\u5f53\u524d\u7a97\u53e3...`,
      );
      const currentWindow = window.getCurrentWindow();
      await currentWindow.close();
      console.log(`[WebRTCChat.handleExit] ✅ 窗口已关闭`);
    } catch (e) {
      console.error(`[WebRTCChat.handleExit] ❌ 退出失败:`, e);
      message.error('退出失败');
    }
  };

  /**
   * 根据连接状态获取对应的状态标签
   */
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
          <span className={styles.title}>WebRTC 视频聊天</span>
          {getStatusTag()}
        </div>
        <div className={styles.headerButtons}>
          <Tooltip title={showVideoPanel ? '隐藏视频' : '显示视频'}>
            <Button
              className={styles.headerBtn}
              type="text"
              icon={<VideoCameraOutlined />}
              onClick={handleToggleVideoPanel}
            />
          </Tooltip>
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
        {showVideoPanel && (
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
        )}

        <div className={styles.chatPanel}>
          <div className={styles.hint}>
            WebRTC P2P 直连聊天，消息不经过服务器，关闭窗口后消息将消失
          </div>
          <div ref={messageContainerRef} className={styles.messageContainer}>
            {connectionStatus === 'failed' && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ color: '#ff4d4f', marginBottom: '12px' }}>
                  \u8fde\u63a5\u5931\u8d25
                </div>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={isRetrying}
                  onClick={handleRetry}
                >
                  \u91cd\u8bd5\u8fde\u63a5
                </Button>
              </div>
            )}
            {connectionStatus === 'connecting' && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin tip="\u6b63\u5728\u5efa\u7acb\u8fde\u63a5..." />
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.messageItem} ${
                  msg.isMine ? styles.mine : styles.friend
                }`}
              >
                <div>
                  <div className={styles.messageBubble}>{msg.text}</div>
                  <div className={styles.messageTime}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.footer}>
            <div className={styles.inputArea}>
              <TextArea
                className={styles.textArea}
                value={inputText}
                onChange={(e: any) => setInputText(e.target.value)}
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
      </div>
    </div>
  );
};

export default WebRTCChat;
