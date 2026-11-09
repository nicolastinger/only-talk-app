/**
 * 隐私聊天编排 hook
 *
 * 集中承载：消息收发状态、视频通话状态、来电弹窗、Tauri 事件监听、退出/发送等动作。
 * 页面组件仅负责把返回值渲染为 UI。
 */
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useRoute } from 'vue-router';
import { subscribe } from '@workspace/services';
import type { VideoCallInvite } from '@workspace/types';
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';

export interface P2pTextMessage {
  type: string;
  send_user: string;
  text: string;
  timestamp: number;
}

export interface ChatMessageItem {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
  senderName?: string;
}

export function usePrivacyChat() {
  const { t } = useI18n();
  const route = useRoute();

  const messages = ref<ChatMessageItem[]>([]);
  const inputText = ref('');
  const isVideoCallActive = ref(false);
  const isVideoCallInitiator = ref(false);
  const incomingCallInvite = ref<VideoCallInvite | null>(null);
  const showIncomingCallModal = ref(false);
  const showEmojiPicker = ref(false);
  // 名称仅读取展示，无需 setter
  const friendName = computed(() => t('privacyChat.other'));
  const myName = computed(() => t('privacyChat.me'));

  const messageContainerRef = ref<HTMLDivElement | null>(null);
  const emojiPickerRef = ref<HTMLDivElement | null>(null);
  const unlistenRef = ref<Array<() => void>>([]);

  const friendId =
    typeof route.query.friendId === 'string' ? route.query.friendId : '';

  const scrollToBottom = () => {
    const container = messageContainerRef.value;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  // 新消息时自动滚动到底部
  watch(messages, scrollToBottom, { deep: true, flush: 'post' });

  // 点击表情面板外部时关闭
  const handleClickOutside = (event: MouseEvent) => {
    if (
      emojiPickerRef.value &&
      !emojiPickerRef.value.contains(event.target as Node)
    ) {
      showEmojiPicker.value = false;
    }
  };

  const unsubscribeAll = () => {
    unlistenRef.value.forEach((unlisten) => unlisten());
    unlistenRef.value = [];
  };

  // 监听 P2P 事件（文本消息 / 视频邀请 / 视频结束）
  const setupListeners = () => {
    const unlistenText = subscribe('p2p_text_message', (payload) => {
      console.log('收到p2p文本消息:', payload);
      try {
        const p2pMsg: P2pTextMessage = JSON.parse(payload);
        const newMessage: ChatMessageItem = {
          id: `${Date.now()}_${Math.random()}`,
          text: p2pMsg.text,
          isMine: false,
          timestamp: p2pMsg.timestamp || Date.now(),
          senderName: friendName.value,
        };
        messages.value = [...messages.value, newMessage];
      } catch (e) {
        console.error('解析p2p消息失败:', e);
      }
    });

    const unlistenInvite = subscribe('video_call_invite', (payload) => {
      console.log('收到视频通话邀请:', payload);
      try {
        const invite: VideoCallInvite = JSON.parse(payload);
        incomingCallInvite.value = invite;
        showIncomingCallModal.value = true;
      } catch (e) {
        console.error('解析视频通话邀请失败:', e);
      }
    });

    const unlistenEnd = subscribe('video_call_end', (payload) => {
      console.log('视频通话已结束:', payload);
      isVideoCallActive.value = false;
      incomingCallInvite.value = null;
      showIncomingCallModal.value = false;
    });

    unlistenRef.value = [unlistenText, unlistenInvite, unlistenEnd];
  };

  onMounted(() => {
    document.addEventListener('mousedown', handleClickOutside);
    setupListeners();
  });

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside);
    unsubscribeAll();
  });

  // 视频通话激活时，取消 PrivacyChat 的文本/邀请监听（由 PrivacyVideoCall 接管）
  watch(isVideoCallActive, (active) => {
    if (active) {
      console.log(
        '[PrivacyChat] PrivacyVideoCall 激活，取消 PrivacyChat 事件监听',
      );
      unsubscribeAll();
    }
  });

  const handleEmojiClick = (emoji: string) => {
    inputText.value += emoji;
    showEmojiPicker.value = false;
  };

  const sendMessage = async () => {
    if (!inputText.value.trim()) {
      return;
    }

    if (!friendId) {
      feedback.message.error(t('privacyChat.errors.noFriendId'));
      return;
    }

    try {
      await invoke('send_p2p_text_msg', {
        text: inputText.value.trim(),
        targetUuid: friendId,
      });

      const newMessage: ChatMessageItem = {
        id: `${Date.now()}_${Math.random()}`,
        text: inputText.value.trim(),
        isMine: true,
        timestamp: Date.now(),
        senderName: myName.value,
      };
      messages.value = [...messages.value, newMessage];
      inputText.value = '';
    } catch (e) {
      console.error('发送消息失败:', e);
      feedback.message.error(t('privacyChat.errors.sendFailed'));
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleExit = async () => {
    try {
      if (friendId) {
        await invoke('close_p2p_connection', {
          targetUuid: friendId,
        });
      }
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      console.error('退出失败:', e);
      feedback.message.error(t('privacyChat.errors.exitFailed'));
    }
  };

  const startVideoCall = () => {
    isVideoCallInitiator.value = true;
    isVideoCallActive.value = true;
  };

  const acceptVideoCall = async () => {
    showIncomingCallModal.value = false;
    isVideoCallInitiator.value = false;
    isVideoCallActive.value = true;
    try {
      await invoke('send_p2p_video_call_response', {
        targetUuid: friendId,
        accept: true,
        mediaConfig: null,
        rejectReason: null,
      });
    } catch (e) {
      console.error('接受视频通话失败:', e);
      feedback.message.error(t('privacyChat.errors.acceptCallFailed'));
    }
  };

  const rejectVideoCall = async () => {
    showIncomingCallModal.value = false;
    try {
      await invoke('send_p2p_video_call_response', {
        targetUuid: friendId,
        accept: false,
        mediaConfig: null,
        rejectReason: t('privacyChat.userRejected'),
      });
    } catch (e) {
      console.error('拒绝视频通话失败:', e);
    }
    incomingCallInvite.value = null;
  };

  const handleVideoCallClose = () => {
    isVideoCallActive.value = false;
    incomingCallInvite.value = null;
    isVideoCallInitiator.value = false;
  };

  return {
    friendId,
    messages,
    inputText,
    setInputText: (value: string) => {
      inputText.value = value;
    },
    isVideoCallActive,
    isVideoCallInitiator,
    incomingCallInvite,
    showIncomingCallModal,
    showEmojiPicker,
    setShowEmojiPicker: (value: boolean) => {
      showEmojiPicker.value = value;
    },
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
  };
}
