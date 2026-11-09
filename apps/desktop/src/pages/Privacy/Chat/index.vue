<script setup lang="ts">
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
import PrivacyVideoCall from '@/components/Media/PrivacyVideoCall/index.vue';
import { useI18n } from '@/i18n';
import {
  LockOutlined,
  LogoutOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import ChatInputBar from './components/ChatInputBar.vue';
import IncomingCallModal from './components/IncomingCallModal.vue';
import MessageList from './components/MessageList.vue';
import { usePrivacyChat } from './hooks/usePrivacyChat';
import styles from './index.module.less';

const { t } = useI18n();
const {
  friendId,
  messages,
  inputText,
  setInputText,
  isVideoCallActive,
  isVideoCallInitiator,
  incomingCallInvite,
  showIncomingCallModal,
  showEmojiPicker,
  setShowEmojiPicker,
  friendName,
  myName,
  messageContainerRef,
  emojiPickerRef,
  sendMessage,
  handleKeyPress,
  handleEmojiClick,
  handleExit,
  startVideoCall,
  acceptVideoCall,
  rejectVideoCall,
  handleVideoCallClose,
} = usePrivacyChat();

// 模板中传 Ref 对象本身（避免 setup 顶层 ref 自动解包）
const elementRefs = {
  messageContainerRef,
  emojiPickerRef,
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.videoSection">
      <PrivacyVideoCall
        v-if="isVideoCallActive"
        :friend-id="friendId"
        :is-initiator="isVideoCallInitiator"
        :invite-info="incomingCallInvite"
        @close="handleVideoCallClose"
      />
      <div v-else :class="styles.videoPlaceholder">
        <div :class="styles.placeholderContent">
          <VideoCameraOutlined :class="styles.placeholderIcon" />
          <p :class="styles.placeholderText">
            {{ t('privacyChat.videoPlaceholder') }}
          </p>
          <a-button
            type="primary"
            size="large"
            :class="styles.startVideoBtn"
            @click="startVideoCall"
          >
            <template #icon><VideoCameraOutlined /></template>
            {{ t('privacyChat.startVideoCall') }}
          </a-button>
        </div>
      </div>
    </div>

    <div :class="styles.chatSection">
      <div :class="styles.chatHeader">
        <div :class="styles.titleWrapper">
          <LockOutlined :class="styles.privacyIcon" />
          <span :class="styles.title">{{ t('privacyChat.title') }}</span>
        </div>
        <a-button
          :class="styles.exitBtn"
          type="text"
          danger
          size="small"
          @click="handleExit"
        >
          <template #icon><LogoutOutlined /></template>
        </a-button>
      </div>

      <div :class="styles.hint">{{ t('privacyChat.hint') }}</div>

      <MessageList
        :messages="messages"
        :my-name="myName"
        :friend-name="friendName"
        :message-container-ref="elementRefs.messageContainerRef"
      />

      <ChatInputBar
        :input-text="inputText"
        :show-emoji-picker="showEmojiPicker"
        :emoji-picker-ref="elementRefs.emojiPickerRef"
        @input-change="setInputText"
        @send="sendMessage"
        @key-press="handleKeyPress"
        @toggle-emoji-picker="() => setShowEmojiPicker(!showEmojiPicker)"
        @emoji-click="handleEmojiClick"
      />
    </div>

    <IncomingCallModal
      :open="showIncomingCallModal"
      :invite="incomingCallInvite"
      @accept="acceptVideoCall"
      @reject="rejectVideoCall"
    />
  </div>
</template>
