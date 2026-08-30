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
 *
 * 结构说明（Stage4 拆分后）：
 * - 逻辑（状态/监听/收发/退出）收敛到 hooks/usePrivacyChat
 * - UI 拆分为 components/MessageList|ChatInputBar|IncomingCallModal
 * - 本文件仅保留布局组装
 */
import {
  LockOutlined,
  LogoutOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button } from 'antd';
import React from 'react';
import styles from './index.less';

import PrivacyVideoCall from '@/components/Media/PrivacyVideoCall';
import ChatInputBar from './components/ChatInputBar';
import IncomingCallModal from './components/IncomingCallModal';
import MessageList from './components/MessageList';
import { usePrivacyChat } from './hooks/usePrivacyChat';

const PrivacyChat: React.FC = () => {
  const intl = useIntl();
  const chat = usePrivacyChat();

  return (
    <div className={styles.container}>
      <div className={styles.videoSection}>
        {chat.isVideoCallActive ? (
          <PrivacyVideoCall
            friendId={chat.friendId}
            isInitiator={chat.isVideoCallInitiator}
            inviteInfo={chat.incomingCallInvite}
            onClose={chat.handleVideoCallClose}
          />
        ) : (
          <div className={styles.videoPlaceholder}>
            <div className={styles.placeholderContent}>
              <VideoCameraOutlined className={styles.placeholderIcon} />
              <p className={styles.placeholderText}>
                {intl.formatMessage({ id: 'privacyChat.videoPlaceholder' })}
              </p>
              <Button
                type="primary"
                size="large"
                icon={<VideoCameraOutlined />}
                onClick={chat.startVideoCall}
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
            <span className={styles.title}>
              {intl.formatMessage({ id: 'privacyChat.title' })}
            </span>
          </div>
          <Button
            className={styles.exitBtn}
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={chat.handleExit}
            size="small"
          />
        </div>

        <div className={styles.hint}>
          {intl.formatMessage({ id: 'privacyChat.hint' })}
        </div>

        <MessageList
          messages={chat.messages}
          myName={chat.myName}
          friendName={chat.friendName}
          messageContainerRef={chat.messageContainerRef}
        />

        <ChatInputBar
          inputText={chat.inputText}
          onInputChange={chat.setInputText}
          onSend={chat.sendMessage}
          onKeyPress={chat.handleKeyPress}
          showEmojiPicker={chat.showEmojiPicker}
          onToggleEmojiPicker={() =>
            chat.setShowEmojiPicker(!chat.showEmojiPicker)
          }
          onEmojiClick={chat.handleEmojiClick}
          emojiPickerRef={chat.emojiPickerRef}
        />
      </div>

      <IncomingCallModal
        open={chat.showIncomingCallModal}
        invite={chat.incomingCallInvite}
        onAccept={chat.acceptVideoCall}
        onReject={chat.rejectVideoCall}
      />
    </div>
  );
};

export default PrivacyChat;
