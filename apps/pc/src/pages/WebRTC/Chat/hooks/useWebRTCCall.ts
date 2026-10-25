/**
 * WebRTC 通话编排 Hook
 *
 * 集中处理 WebRTC 通话窗口的：
 * - 初始化（本地媒体流、创建 offer/answer）
 * - 信令监听（webrtc_signal=100）与通话回应监听（13接受/14拒绝）
 * - 连接生命周期与媒体开关
 * - 退出/重试/拒绝等交互动作
 *
 * 组件层仅负责渲染，调用此 Hook 获取状态与动作。
 */
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { updateWebRTCWindowState } from '@/hooks/useWebRTCSignalApi';
import { initWebRTCConsoleCapture, useWebRTCLogs } from '@/services/webrtcLog';
import { getWebRTCService, initWebRTCService } from '@/services/webrtcService';
import { window } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/core';
import { useIntl, useLocation } from '@umijs/max';
import {
  decodeP2PChatFrame,
  encodeP2PChatHello,
  encodeP2PChatMessage,
  encodeP2PChatRead,
  genP2PChatMessageId,
  P2P_CHAT_CAP_READ,
  subscribe,
} from '@workspace/services';
import { ChatSessionVo, WebRTCSignalMessage } from '@workspace/types';
import { message } from 'antd';
import { nanoid } from 'nanoid';
import React, { useEffect, useRef, useState } from 'react';

/** 通话计时格式：不足 1 小时 MM:SS，超过 1 小时 HH:MM:SS */
export const formatCallDuration = (totalSeconds: number): string => {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
};

export interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
  senderName?: string;
  /** 已通过 DataChannel 发出 */
  delivered?: boolean;
  /** 对方已读回执 */
  read?: boolean;
}

interface WebRTCSignalMsgRaw {
  type: 'offer' | 'answer' | 'candidate' | 'end';
  sender: string;
  receiver: string;
  sessionId: string;
  data: unknown;
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

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
type CallStage =
  | 'incoming'
  | 'outgoing'
  | 'connecting'
  | 'connected'
  | 'rejected'
  | 'ended';

export const useWebRTCCall = () => {
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
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionState>('connecting');
  const [callStage, setCallStage] = useState<CallStage>(
    isInitiator ? 'outgoing' : 'incoming',
  );
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeView, setActiveView] = useState<'video' | 'log'>('video');
  const [friendName, setFriendName] = useState('');
  const [friendIcon, setFriendIcon] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const webRTCLogs = useWebRTCLogs();

  const { avatarMap } = useAvatarMap([friendIcon]);
  const friendAvatar = friendIcon ? avatarMap.get(friendIcon) : undefined;

  // 通话计时：WebRTC 连接建立后开始，断开即停止（保留已计时长用于结束提示）
  const connectedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (connectionStatus !== 'connected') {
      return;
    }
    connectedAtRef.current = Date.now();
    setCallDuration(0);
    const timer = setInterval(() => {
      if (connectedAtRef.current !== null) {
        setCallDuration(
          Math.floor((Date.now() - connectedAtRef.current) / 1000),
        );
      }
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [connectionStatus]);

  const callDurationText = formatCallDuration(callDuration);

  // 读取好友昵称与头像（与聊天列表同源：本地会话store）
  useEffect(() => {
    if (!friendId) return;
    let cancelled = false;
    const loadFriendInfo = async () => {
      try {
        const sessions = await invoke<ChatSessionVo[]>(
          'get_chat_session_from_store',
          {},
        );
        const session = sessions.find(
          (item) => item.send_user === friendId || item.recv_user === friendId,
        );
        if (cancelled || !session) return;
        setFriendName(session.friend_name || '');
        setFriendIcon(session.friend_icon || '');
      } catch (e) {
        console.log('[WebRTCChat] 读取好友信息失败:', e);
      }
    };
    loadFriendInfo();
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  const isPreCall =
    callStage === 'incoming' ||
    callStage === 'outgoing' ||
    callStage === 'rejected';

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  // 本地媒体采集可能还在进行中就收到"对方已接受"，createOffer 前先等它完成，
  // 否则连接创建时 localStream 为 null，轨道根本不会加进 SDP（对端既无音频也无视频）
  const localStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  // 对方是否声明支持已读回执（来自 hello 帧）
  const peerReadCapableRef = useRef(false);

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
  const sendControlMsg = async (
    text_type: number,
    type: string,
    sessionId: string,
  ) => {
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
    await invoke('send_call_control_msg', { textQuicMsg: msg });
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
    // 采集尚未完成时先等一等，保证 offer 里带上本地音视频轨
    if (!service.getLocalStream() && localStreamPromiseRef.current) {
      console.log('[WebRTCChat] 等待本地媒体采集完成后再创建offer...');
      await localStreamPromiseRef.current.catch(() => {});
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

  // 被叫方/发起方：拒绝
  const handleReject = async () => {
    const service = getWebRTCService();
    const sessionId = service?.sessionId || urlSessionId;
    await sendControlMsg(14, 'reject', sessionId);
    setCallStage('rejected');
    // 短暂提示后自动关闭窗口
    setTimeout(() => closeWebRTCWindow(), 2000);
  };

  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
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
        const mediaPromise = service.initLocalStream(true, true);
        localStreamPromiseRef.current = mediaPromise;
        const stream = await mediaPromise;
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log(`[WebRTCChat] ✅ 本地视频流已绑定`);
        }
      } catch (error) {
        console.error(`[WebRTCChat] ❌ 初始化本地媒体流失败:`, error);
        setLocalStream(null);
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
          // 同步到 state：VideoPanel 依赖它监听视频轨的 mute/unmute（对方开关摄像头）
          setRemoteStream(stream);
        },
      );

      service.setOnMessageCallback((fromFriendId: string, raw: string) => {
        console.log(
          `[WebRTCChat.onMessageCallback] 收到来自${fromFriendId}的数据: ${raw}`,
        );
        if (fromFriendId !== friendId) return;
        const frame = decodeP2PChatFrame(raw);

        // 能力协商：对方声明支持已读回执
        if (frame.kind === 'hello') {
          peerReadCapableRef.current = frame.caps.includes(P2P_CHAT_CAP_READ);
          console.log(
            `[WebRTCChat] 对方能力: ${frame.caps.join(',') || '(none)'}`,
          );
          return;
        }

        // 已读回执：把我发出去的消息标记为已读
        if (frame.kind === 'read') {
          const ids = new Set(frame.ids);
          setMessages((prev) =>
            prev.map((m) =>
              m.isMine && ids.has(m.id) ? { ...m, read: true } : m,
            ),
          );
          return;
        }

        // 文本消息（含旧版本纯文本）
        const id = frame.id || genP2PChatMessageId();
        const newMessage: ChatMessageItem = {
          id,
          text: frame.text,
          isMine: false,
          timestamp: frame.ts || Date.now(),
          senderName: intl.formatMessage({ id: 'webrtc.peer' }),
          delivered: true,
          read: true,
        };
        setMessages((prev) => [...prev, newMessage]);

        // 收到即回执（对方支持才发，避免旧版本把 JSON 当成消息显示）
        if (peerReadCapableRef.current) {
          service.sendMessage(friendId, encodeP2PChatRead([id]));
        }
      });

      // 文字通道就绪/断开：用于启用输入框 + 互报能力
      service.setOnDataChannelStateChange(
        (fromFriendId: string, open: boolean) => {
          if (fromFriendId !== friendId) return;
          setChatReady(open);
          if (open) {
            service.sendMessage(
              friendId,
              encodeP2PChatHello([P2P_CHAT_CAP_READ]),
            );
          }
        },
      );
      setChatReady(service.isDataChannelOpen(friendId));
      console.log(`[WebRTCChat] 消息回调已设置`);

      service.setOnConnectionStateChange(
        (fromFriendId: string, state: RTCPeerConnectionState) => {
          console.log(
            `[WebRTCChat.onConnectionStateChange] 连接状态变化: ${state}`,
          );
          if (state === 'connected') {
            setConnectionStatus('connected');
            setCallStage('connected');
            setIsVideoEnabled(service.getVideoEnabled());
            setIsAudioEnabled(service.getAudioEnabled());
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
            const answer = await service.handleOffer(
              friendId,
              signalMsg.data as RTCSessionDescriptionInit,
            );
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
          message.error(
            intl.formatMessage({ id: 'webrtc.signalProcessFailed' }),
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setLocalStream(local ?? null);
    const remote = service.getRemoteStream(friendId);
    if (remote && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remote;
    }
    setRemoteStream(remote ?? null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreCall, friendId, activeView]);

  // 本地小窗的 <video> 常驻挂载（关闭摄像头只是隐藏），绑流统一交给 VideoPanel 的
  // localStream effect 处理，避免元素重挂载后 srcObject 为空导致预览黑屏。

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = () => {
      try {
        console.log(
          `[WebRTCChat] useEffect(setupListener) - 开始设置信令事件监听...`,
        );

        unlisten = subscribe('webrtc_signal', async (payload) => {
          console.log(`[WebRTCChat.onWebRTCSignal] 📡 收到WebRTC信令事件`);
          try {
            const msgVo: TextQuicMsgVo = JSON.parse(payload);
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
              await service.handleAnswer(
                friendId,
                signalMsg.data as RTCSessionDescriptionInit,
              );
              console.log(`[WebRTCChat.onWebRTCSignal] ✅ answer已处理`);
            } else if (signalMsg.type === 'offer') {
              console.log(
                `[WebRTCChat.onWebRTCSignal] 收到来自${friendId}的offer（可能是ICE重启），正在处理...`,
              );
              try {
                const restartAnswer = await service.handleOffer(
                  friendId,
                  signalMsg.data as RTCSessionDescriptionInit,
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
              await service.handleCandidate(
                friendId,
                signalMsg.data as RTCIceCandidateInit,
              );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId]);

  // 监听对方对通话邀请的回应（call_control）：13=接受(发起offer)，14=拒绝，15=结束
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = () => {
      try {
        unlisten = subscribe('call_control', async (payload) => {
          const text: TextQuicMsgVo = JSON.parse(payload);
          if (text.recv_user !== localUserId || text.send_user !== friendId) {
            return;
          }
          if (text.text_type === 13) {
            console.log(`[WebRTCChat] 收到对方接受通知，开始创建offer...`);
            try {
              await sendOffer();
            } catch (e) {
              console.error('[WebRTCChat] 创建offer失败:', e);
              message.error(
                intl.formatMessage({ id: 'webrtc.connectionCreateFailed' }),
              );
            }
          } else if (text.text_type === 14) {
            console.log(`[WebRTCChat] 对方拒绝了通话请求`);
            setCallStage('rejected');
            setTimeout(() => closeWebRTCWindow(), 2000);
          } else if (text.text_type === 15) {
            console.log(`[WebRTCChat] 对方结束了通话，关闭连接`);
            const service = getWebRTCService();
            if (service) {
              await service.closeConnection(friendId);
            }
            setCallStage('ended');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId, localUserId]);

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
      message.error(
        intl.formatMessage({ id: 'webrtc.connectionNotEstablished' }),
      );
      return;
    }

    if (!service.isDataChannelOpen(friendId)) {
      console.error(`[WebRTCChat.sendMessage] ❌ DataChannel未打开`);
      message.error(
        intl.formatMessage({ id: 'webrtc.connectionNotEstablished' }),
      );
      return;
    }

    const text = inputText.trim();
    const id = genP2PChatMessageId();
    const success = service.sendMessage(
      friendId,
      encodeP2PChatMessage(id, text),
    );
    if (success) {
      console.log(
        `[WebRTCChat.sendMessage] ✅ 消息发送成功，添加到本地消息列表`,
      );

      const newMessage: ChatMessageItem = {
        id,
        text,
        isMine: true,
        timestamp: Date.now(),
        senderName: intl.formatMessage({ id: 'webrtc.me' }),
        delivered: true,
        read: false,
      };
      setMessages((prev) => [...prev, newMessage]);
      setInputText('');
    } else {
      console.error(`[WebRTCChat.sendMessage] ❌ 消息发送失败`);
      message.error(intl.formatMessage({ id: 'webrtc.sendFailed' }));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleToggleVideo = () => {
    const service = getWebRTCService();
    if (!service) return;
    // 没有视频轨（采集失败/被释放）时直接提示，避免"点一下小窗就消失且再也回不来"
    if (!service.getLocalStream()?.getVideoTracks().length) {
      message.warning(intl.formatMessage({ id: 'webrtc.mediaAccessError' }));
      return;
    }
    const enabled = service.toggleVideo();
    setIsVideoEnabled(enabled);
    setLocalStream(service.getLocalStream());
    console.log(`[WebRTCChat] 视频状态切换为: ${enabled ? '开启' : '关闭'}`);
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
    setCallStage('connecting');
    setCallDuration(0);
    connectedAtRef.current = null;

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
        console.log(`[WebRTCChat.handleExit] 先发送结束控制消息(15)，再关闭连接...`);
        // 发送 15-end 控制命令通知对端（自动生成"通话已结束"文本记录；对端据此清理连接）
        try {
          await sendControlMsg(15, 'end', service.sessionId);
          console.log(`[WebRTCChat.handleExit] ✅ 结束控制消息已发送`);
        } catch (sendEndErr) {
          console.error(
            `[WebRTCChat.handleExit] 发送结束控制消息失败:`,
            sendEndErr,
          );
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

  return {
    friendId,
    friendName,
    friendAvatar,
    localUserId,
    isInitiator,
    isPreCall,
    messages,
    inputText,
    connectionStatus,
    callStage,
    callDuration,
    callDurationText,
    isVideoEnabled,
    isAudioEnabled,
    isRetrying,
    chatReady,
    showEmojiPicker,
    activeView,
    webRTCLogs,
    remoteStream,
    localStream,
    messageContainerRef,
    localVideoRef,
    remoteVideoRef,
    emojiPickerRef,
    logContainerRef,
    setInputText,
    setShowEmojiPicker,
    setActiveView,
    handleAccept,
    handleReject,
    handleEmojiClick,
    sendMessage,
    handleKeyPress,
    handleToggleVideo,
    handleToggleAudio,
    handleRetry,
    handleExit,
  };
};
