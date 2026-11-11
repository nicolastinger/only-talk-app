<script setup lang="ts">
import { onMounted } from 'vue';
import { theme } from 'ant-design-vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AvatarCropHost from '@/components/AvatarCropModal/Host.vue';
import DevAssistant from '@/components/DevAssistant/index.vue';
import FeedbackBridge from '@/components/FeedbackBridge.vue';
import SyncLoadingOverlay from '@/components/SyncLoadingOverlay/index.vue';
import { useDevAssistantStore } from '@/stores/devAssistant';
import {
  useMessageSound,
  useP2pMessageApi,
  useWebRTCIncomingCall,
  useWebRTCSignalApi,
} from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import styles from './styles/RootLayout.module.less';

useP2pMessageApi();
// 来消息提示音(可在设置-通知中关闭)
useMessageSound();
useWebRTCSignalApi();
// 全局监听视频通话来电（不依赖所在聊天会话），确保不漏接
useWebRTCIncomingCall();

// 启动时恢复持久化主题，并让 antd 组件跟随深浅色
const { effectiveMode } = useTheme();

// 开发助手默认隐藏，可在设置中开启
const devAssistant = useDevAssistantStore();

// 窗口在 tauri.conf.json 中配置为 visible:false，首帧渲染完成后再显示，避免白屏
onMounted(() => {
  if (!('__TAURI_INTERNALS__' in window)) return;
  const showWindow = () => {
    getCurrentWindow()
      .show()
      .catch(() => {});
  };
  requestAnimationFrame(() => requestAnimationFrame(showWindow));
});
</script>

<template>
  <a-config-provider
    :theme="{
      algorithm:
        effectiveMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    }"
  >
    <a-app>
      <FeedbackBridge />
      <div :class="styles.container">
        <router-view />
        <AvatarCropHost />
        <DevAssistant v-if="devAssistant.visible" />
        <SyncLoadingOverlay />
      </div>
    </a-app>
  </a-config-provider>
</template>
