<script setup lang="ts">
/**
 * WebRTC P2P 聊天组件
 *
 * 职责：仅负责模板组装。
 * 业务逻辑（初始化、信令监听、连接生命周期、媒体开关、通话计时、退出/重试）已抽离到
 * hooks/useWebRTCCall；各局部界面拆分为 components/ 下的子组件。
 *
 * URL参数：
 * - friendId: 对端用户ID
 * - initiator: 'true'表示发起方，'false'表示响应方
 * - localUserId: 当前用户ID
 * - signalData: 初始信令数据(仅响应方需要，包含对端的offer)
 * - sessionId: 会话ID（由邀请流程注入）
 */
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import { LogoutOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import CallScreen from './components/CallScreen.vue';
import ChatPanel from './components/ChatPanel.vue';
import ConnectionStatusTag from './components/ConnectionStatusTag.vue';
import LogPanel from './components/LogPanel.vue';
import VideoPanel from './components/VideoPanel.vue';
import { clearWebRTCLogs, useWebRTCCall } from './hooks/useWebRTCCall';
import styles from './index.module.less';

const { t } = useI18n();
const {
  friendName,
  friendAvatar,
  isPreCall,
  messages,
  inputText,
  connectionStatus,
  callStage,
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
} = useWebRTCCall();

// 模板中传 Ref 对象本身（避免 setup 顶层 ref 自动解包）
const elementRefs = {
  messageContainerRef,
  localVideoRef,
  remoteVideoRef,
  emojiPickerRef,
  logContainerRef,
};

const isConnected = computed(() => connectionStatus.value === 'connected');
const statusText = computed(() =>
  connectionStatus.value === 'failed'
    ? t('call.failed')
    : connectionStatus.value === 'disconnected'
      ? t('webrtc.disconnected')
      : isRetrying.value
        ? t('webrtc.retryConnection')
        : t('call.connecting'),
);

const onAccept = () => {
  handleAccept().catch(() => {});
};

const onReject = () => {
  handleReject().catch(() => {});
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.header">
      <div :class="styles.titleWrapper">
        <img
          :class="styles.headerAvatar"
          :src="friendAvatar || DEFAULT_ICON"
          alt=""
        />
        <span :class="styles.title">
          {{ friendName || t('webrtc.videoChat') }}
        </span>
        <span v-if="isConnected" :class="styles.headerTimer">
          <span :class="styles.headerTimerDot" />
          {{ callDurationText }}
        </span>
        <ConnectionStatusTag v-else :status="connectionStatus" />
      </div>
      <div :class="styles.viewTabs">
        <span
          :class="[
            styles.viewTab,
            activeView === 'video' ? styles.viewTabActive : '',
          ]"
          @click="setActiveView('video')"
        >
          {{ t('webrtc.videoTab') }}
        </span>
        <span
          :class="[
            styles.viewTab,
            activeView === 'log' ? styles.viewTabActive : '',
          ]"
          @click="setActiveView('log')"
        >
          {{ t('webrtc.logTab') }}
        </span>
      </div>
      <div :class="styles.headerButtons">
        <a-button
          :class="styles.exitBtn"
          type="text"
          danger
          @click="handleExit"
        >
          <template #icon><LogoutOutlined /></template>
          {{ t('webrtc.exit') }}
        </a-button>
      </div>
    </div>

    <LogPanel
      v-if="activeView === 'log'"
      :logs="webRTCLogs"
      :log-container-ref="elementRefs.logContainerRef"
      @clear="clearWebRTCLogs"
    />
    <CallScreen
      v-else-if="isPreCall"
      :call-stage="callStage"
      :friend-name="friendName"
      :friend-avatar="friendAvatar"
      :is-video-call="isVideoEnabled"
      @accept="onAccept"
      @reject="onReject"
      @cancel="handleExit"
    />
    <div v-else :class="styles.mainContent">
      <VideoPanel
        :is-video-enabled="isVideoEnabled"
        :is-audio-enabled="isAudioEnabled"
        :is-connected="isConnected"
        :friend-name="friendName"
        :friend-avatar="friendAvatar"
        :call-duration-text="callDurationText"
        :status-text="statusText"
        :remote-stream="remoteStream"
        :local-stream="localStream"
        :local-video-ref="elementRefs.localVideoRef"
        :remote-video-ref="elementRefs.remoteVideoRef"
        @toggle-video="handleToggleVideo"
        @toggle-audio="handleToggleAudio"
        @hangup="handleExit"
      />
      <ChatPanel
        :messages="messages"
        :connection-status="connectionStatus"
        :chat-ready="chatReady"
        :is-retrying="isRetrying"
        :input-text="inputText"
        :show-emoji-picker="showEmojiPicker"
        :message-container-ref="elementRefs.messageContainerRef"
        :emoji-picker-ref="elementRefs.emojiPickerRef"
        @input-change="setInputText"
        @key-press="handleKeyPress"
        @send="sendMessage"
        @toggle-emoji="() => setShowEmojiPicker(!showEmojiPicker)"
        @emoji-click="handleEmojiClick"
        @retry="handleRetry"
      />
    </div>
  </div>
</template>
