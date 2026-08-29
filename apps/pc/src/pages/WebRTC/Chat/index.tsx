/**
 * WebRTC P2P 聊天组件
 *
 * 职责：仅负责 JSX 组装。
 * 业务逻辑（初始化、信令监听、连接生命周期、媒体开关、退出/重试）已抽离到
 * hooks/useWebRTCCall；各局部界面拆分为 components/ 下的子组件。
 *
 * URL参数：
 * - friendId: 对端用户ID
 * - initiator: 'true'表示发起方，'false'表示响应方
 * - localUserId: 当前用户ID
 * - signalData: 初始信令数据(仅响应方需要，包含对端的offer)
 * - sessionId: 会话ID（由邀请流程注入）
 */
import { clearWebRTCLogs } from '@/services/webrtcLog';
import { ApiOutlined, LogoutOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button } from 'antd';
import React from 'react';
import CallScreen from './components/CallScreen';
import ChatPanel from './components/ChatPanel';
import ConnectionStatusTag from './components/ConnectionStatusTag';
import LogPanel from './components/LogPanel';
import VideoPanel from './components/VideoPanel';
import { useWebRTCCall } from './hooks/useWebRTCCall';
import styles from './index.less';

const WebRTCChat: React.FC = () => {
  const intl = useIntl();
  const {
    isPreCall,
    messages,
    inputText,
    connectionStatus,
    callStage,
    isVideoEnabled,
    isAudioEnabled,
    isRetrying,
    showEmojiPicker,
    activeView,
    webRTCLogs,
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
  } = useWebRTCCall();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ApiOutlined className={styles.webrtcIcon} />
          <span className={styles.title}>
            {intl.formatMessage({ id: 'webrtc.videoChat' })}
          </span>
          <ConnectionStatusTag status={connectionStatus} />
        </div>
        <div className={styles.viewTabs}>
          <span
            className={`${styles.viewTab} ${
              activeView === 'video' ? styles.viewTabActive : ''
            }`}
            onClick={() => setActiveView('video')}
          >
            {intl.formatMessage({ id: 'webrtc.videoTab' })}
          </span>
          <span
            className={`${styles.viewTab} ${
              activeView === 'log' ? styles.viewTabActive : ''
            }`}
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
        <LogPanel
          logs={webRTCLogs}
          logContainerRef={logContainerRef}
          onClear={clearWebRTCLogs}
        />
      ) : isPreCall ? (
        <CallScreen
          callStage={callStage}
          onAccept={() => {
            handleAccept().catch(() => {});
          }}
          onReject={() => {
            handleReject().catch(() => {});
          }}
        />
      ) : (
        <div className={styles.mainContent}>
          <VideoPanel
            isVideoEnabled={isVideoEnabled}
            isAudioEnabled={isAudioEnabled}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            onToggleVideo={handleToggleVideo}
            onToggleAudio={handleToggleAudio}
          />
          <ChatPanel
            messages={messages}
            connectionStatus={connectionStatus}
            isRetrying={isRetrying}
            inputText={inputText}
            showEmojiPicker={showEmojiPicker}
            messageContainerRef={messageContainerRef}
            emojiPickerRef={emojiPickerRef}
            onInputChange={setInputText}
            onKeyPress={handleKeyPress}
            onSend={sendMessage}
            onToggleEmoji={() => setShowEmojiPicker((v) => !v)}
            onEmojiClick={handleEmojiClick}
            onRetry={handleRetry}
          />
        </div>
      )}
    </div>
  );
};

export default WebRTCChat;
