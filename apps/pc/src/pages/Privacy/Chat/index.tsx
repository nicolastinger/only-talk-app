/**
 * 隐私聊天页面
 * 
 * 功能说明：
 * 1. 隐私文本聊天 - 消息不保存到本地
 * 2. 视频通话 - 支持发起和接收视频通话邀请
 * 3. P2P通信 - 所有消息通过P2P连接传输
 * 
 * 使用方式：
 * 访问路径: /privacy/chat?friendId=对方UUID
 */
import { LockOutlined, LogoutOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { window } from '@tauri-apps/api';
import { useLocation } from '@umijs/max';
import { Button, Input, message, Modal } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import PrivacyVideoCall from '@/components/Media/PrivacyVideoCall';
import { VideoCallInvite } from '@workspace/types';
import styles from './index.less';

const { TextArea } = Input;

// ==================== 消息接口定义 ====================

/** P2P文本消息接口 */
interface P2pTextMessage {
  type: string;
  send_user: string;
  text: string;
  timestamp: number;
}

/** 聊天消息项接口 */
interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
}

// ==================== 主组件 ====================

const PrivacyChat: React.FC = () => {
  // ==================== 状态定义 ====================
  
  /** 聊天消息列表 */
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  
  /** 输入框文本 */
  const [inputText, setInputText] = useState('');
  
  /** 是否处于视频通话状态 */
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  
  /** 是否为视频通话发起方 */
  const [isVideoCallInitiator, setIsVideoCallInitiator] = useState(false);
  
  /** 收到的视频通话邀请 */
  const [incomingCallInvite, setIncomingCallInvite] = useState<VideoCallInvite | null>(null);
  
  /** 是否显示来电弹窗 */
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);

  // ==================== 引用定义 ====================
  
  /** 消息容器引用 - 用于自动滚动到底部 */
  const messageContainerRef = useRef<HTMLDivElement>(null);
  
  /** 事件监听器清理函数列表 */
  const unlistenRef = useRef<(() => void)[]>([]);

  // ==================== 路由参数获取 ====================
  
  /** 获取路由参数 */
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendId = params.get('friendId') || '';

  // ==================== 自动滚动到底部 ====================
  
  /** 当消息列表更新时，自动滚动到底部 */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ==================== 设置事件监听器 ====================
  
  /**
   * 设置所有事件监听器
   * 
   * 监听的事件:
   * - p2p_text_message: 接收P2P文本消息
   * - video_call_invite: 接收视频通话邀请
   * - video_call_end: 视频通话结束
   */
  useEffect(() => {
    const setupListeners = async () => {
      // 监听P2P文本消息
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

      // 监听视频通话邀请
      const unlistenInvite = await listen<string>('video_call_invite', (event) => {
        console.log('收到视频通话邀请:', event.payload);
        try {
          const invite: VideoCallInvite = JSON.parse(event.payload);
          setIncomingCallInvite(invite);
          setShowIncomingCallModal(true);
        } catch (e) {
          console.error('解析视频通话邀请失败:', e);
        }
      });

      // 监听视频通话结束
      const unlistenEnd = await listen<string>('video_call_end', (event) => {
        console.log('视频通话已结束:', event.payload);
        setIsVideoCallActive(false);
        setIncomingCallInvite(null);
        setShowIncomingCallModal(false);
      });

      // 保存清理函数
      unlistenRef.current = [unlistenText, unlistenInvite, unlistenEnd];
    };

    setupListeners();

    // 组件卸载时清理所有监听器
    return () => {
      unlistenRef.current.forEach((unlisten) => unlisten());
    };
  }, []);

  // ==================== 工具函数 ====================
  
  /** 滚动消息容器到底部 */
  const scrollToBottom = () => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  /** 格式化时间戳为 HH:mm 格式 */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // ==================== 消息发送 ====================
  
  /**
   * 发送文本消息
   * 
   * 流程:
   * 1. 检查消息是否为空
   * 2. 检查好友ID是否存在
   * 3. 通过P2P连接发送消息
   * 4. 更新本地消息列表
   */
  const sendMessage = async () => {
    if (!inputText.trim()) {
      return;
    }

    if (!friendId) {
      message.error('无法获取好友ID');
      return;
    }

    try {
      // 发送P2P文本消息
      await invoke('send_p2p_text_msg', {
        text: inputText.trim(),
        targetUuid: friendId,
      });

      // 更新本地消息列表
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

  /** 处理键盘按下事件 - Enter发送消息 */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ==================== 退出处理 ====================
  
  /**
   * 退出隐私聊天
   * 
   * 流程:
   * 1. 关闭P2P连接
   * 2. 关闭当前窗口
   */
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

  // ==================== 视频通话处理 ====================
  
  /**
   * 发起视频通话
   * 
   * 流程:
   * 1. 设置为发起方
   * 2. 激活视频通话界面
   */
  const startVideoCall = () => {
    setIsVideoCallInitiator(true);
    setIsVideoCallActive(true);
  };

  /**
   * 接受视频通话邀请
   */
  const acceptVideoCall = () => {
    setShowIncomingCallModal(false);
    setIsVideoCallInitiator(false);
    setIsVideoCallActive(true);
  };

  /**
   * 拒绝视频通话邀请
   */
  const rejectVideoCall = async () => {
    setShowIncomingCallModal(false);
    try {
      await invoke('send_p2p_video_call_response', {
        targetUuid: friendId,
        accept: false,
        mediaConfig: null,
        rejectReason: '用户拒绝',
      });
    } catch (e) {
      console.error('拒绝视频通话失败:', e);
    }
    setIncomingCallInvite(null);
  };

  /**
   * 视频通话结束回调
   */
  const handleVideoCallClose = () => {
    setIsVideoCallActive(false);
    setIncomingCallInvite(null);
    setIsVideoCallInitiator(false);
  };

  // ==================== 渲染视频通话界面 ====================
  
  /** 如果处于视频通话状态，渲染视频通话组件 */
  if (isVideoCallActive) {
    return (
      <div className={styles.videoCallPage}>
        <PrivacyVideoCall 
          friendId={friendId} 
          isInitiator={isVideoCallInitiator}
          inviteInfo={incomingCallInvite}
          onClose={handleVideoCallClose} 
        />
      </div>
    );
  }

  // ==================== 渲染聊天界面 ====================

  return (
    <div className={styles.container}>
      {/* 页面头部 */}
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <LockOutlined className={styles.privacyIcon} />
          <span className={styles.title}>隐私聊天</span>
        </div>
        <div className={styles.headerActions}>
          {/* 视频通话按钮 */}
          <Button
            type="text"
            icon={<VideoCameraOutlined />}
            onClick={startVideoCall}
            className={styles.videoCallBtn}
          >
            视频通话
          </Button>
          {/* 退出按钮 */}
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

      {/* 隐私提示 */}
      <div className={styles.hint}>
        隐私聊天消息不会保存到本地，关闭窗口后消息将消失
      </div>

      {/* 消息列表 */}
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

      {/* 输入区域 */}
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

      {/* 来电弹窗 */}
      <Modal
        title="视频通话邀请"
        open={showIncomingCallModal}
        onOk={acceptVideoCall}
        onCancel={rejectVideoCall}
        okText="接受"
        cancelText="拒绝"
      >
        <p>
          {incomingCallInvite?.from_name || '对方'} 邀请您进行视频通话
        </p>
      </Modal>
    </div>
  );
};

export default PrivacyChat;
