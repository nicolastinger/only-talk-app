<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  MinusOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import AnnouncementBanner from '@/components/AnnouncementBanner/index.vue';
import ConnectionStatusTag from '@/components/ConnectionStatusTag/index.vue';
import DraggableHeader from '@/components/DraggableHeader/index.vue';
import { LeftAside } from '@/components/LeftAside';
import MessageAlertBanner from '@/components/MessageAlertBanner/index.vue';
import OnlineStatusSwitch from '@/components/OnlineStatusSwitch/index.vue';
import {
  LanguageButton,
  MuteButton,
  QuicDisconnectButton,
  QuicReconnectButton,
  ThemeButton,
} from '@/components/ToolButtons';
import { useQuicDisconnect } from '@/hooks/useQuicDisconnect';
import { useSystemNotify } from '@/hooks/useSystemNotify';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  cache_user_info,
  getApiBase,
  get_cached_user_info,
  list_auth_factors,
  subscribe,
} from '@workspace/services';
import { AuthFactorType } from '@workspace/types';
import type { HttpResponse, ResponseData, UserInfo } from '@workspace/types';
import styles from './index.module.less';

// 同一次应用运行内只提示一次二次认证绑定引导
let authFactorChecked = false;

const { t } = useI18n();
const router = useRouter();
const store = useBearStore();

const isHovered = ref(false);
const isMaximized = ref(false);
const closeModalVisible = ref(false);
const isReconnecting = ref(false);
const forceLogoutVisible = ref(false);
const forceLogoutReason = ref('');

const {
  isConnected,
  statusTag,
  resetConnection,
} = useQuicDisconnect();

let offForceLogout: (() => void) | undefined;

const confirmForceLogout = async () => {
  forceLogoutVisible.value = false;
  try {
    await invoke('logout');
    await invoke('clear_user_info');
    store.setIsLogin(false);
    store.setUserInfo({ uuid: '' });
    router.push('/signIn');
  } catch (error) {
    console.error('强制退出登录失败:', error);
  }
};

const handleReconnect = async () => {
  if (isReconnecting.value) return;
  try {
    isReconnecting.value = true;
    await invoke('reconnect_quic_command');
    resetConnection();
  } catch (error) {
    console.error('重新连接失败:', error);
  } finally {
    isReconnecting.value = false;
  }
};

const minimizeWindow = async (e: MouseEvent) => {
  e.stopPropagation();
  await Window.getCurrent().minimize();
};

const toggleMaximize = async (e: MouseEvent) => {
  e.stopPropagation();
  const currentWindow = Window.getCurrent();
  const maximized = await currentWindow.isMaximized();
  if (maximized) {
    await currentWindow.unmaximize();
    isMaximized.value = false;
  } else {
    await currentWindow.maximize();
    isMaximized.value = true;
  }
};

const closeWindow = (e: MouseEvent) => {
  e.stopPropagation();
  closeModalVisible.value = true;
};

const hideToTray = async () => {
  const currentWindow = Window.getCurrent();
  await invoke('add_user_map', {
    map: { window_hide: '1', app_foreground: '0' },
  });
  await currentWindow.hide();
  closeModalVisible.value = false;
};

const quitApp = async () => {
  const currentWindow = Window.getCurrent();
  await currentWindow.close();
  closeModalVisible.value = false;
};

const initUserInfo = async () => {
  try {
    const uuid: string = await invoke('get_user_map', { key: 'uuid' });
    const me: string = await invoke('get_user_map', { key: 'me' });
    const info: UserInfo = JSON.parse(me);
    if (uuid === info.uuid) {
      store.setUserInfo(info);
      return;
    }
  } catch (error) {
    console.log('本地缓存获取用户信息失败', error);
  }

  try {
    const res: HttpResponse = await invoke('post_request', {
      url: getApiBase() + '/user/me',
      body: '',
    });
    const data: ResponseData<UserInfo> = JSON.parse(res.body);
    const remoteUserInfo: UserInfo = data.data;
    const cachedUserInfo = await get_cached_user_info(remoteUserInfo.uuid);
    const isDifferent =
      !cachedUserInfo ||
      JSON.stringify(cachedUserInfo) !== JSON.stringify(remoteUserInfo);
    if (isDifferent) {
      await cache_user_info(remoteUserInfo);
    }
    await invoke('add_user_map', {
      map: { me: JSON.stringify(remoteUserInfo) },
    });
    store.setUserInfo(remoteUserInfo);
  } catch (error) {
    console.log(error);
  }
};

const checkAuthFactorBound = async () => {
  if (authFactorChecked) return;
  authFactorChecked = true;
  try {
    const data = await list_auth_factors();
    const hasEmail = data.list.some(
      (f) => f.factor_type === AuthFactorType.EMAIL,
    );
    if (hasEmail) return;
    feedback.modal.confirm({
      title: t('settings.authFactor.title'),
      content: t(
        'settings.authFactor.loginPrompt',
        undefined,
        '为了账号安全，建议绑定邮箱二次认证。是否现在绑定？',
      ),
      okText: t(
        'settings.authFactor.goBind',
        undefined,
        '去绑定',
      ),
      cancelText: t('settings.authFactor.later', undefined, '稍后'),
      onOk: () => {
        router.push('/home/settings?tab=authFactor');
      },
    });
  } catch (error) {
    console.log('检查二次认证因素失败', error);
  }
};

onMounted(() => {
  offForceLogout = subscribe('force_logout', (payload) => {
    forceLogoutReason.value = payload || '';
    forceLogoutVisible.value = true;
  });
  initUserInfo();
  checkAuthFactorBound();
});

onUnmounted(() => offForceLogout?.());

useSystemNotify(() => store.userInfo.uuid);
</script>

<template>
  <a-layout :class="styles.userHomeContainer">
    <a-layout-sider
      :width="72"
      :class="styles.leftSideBar"
      :style="{ background: 'transparent' }"
    >
      <LeftAside />
    </a-layout-sider>
    <a-layout
      :class="styles.rightSideBar"
      :style="{ background: 'transparent' }"
    >
      <a-layout-header
        :class="styles.rightSideBarTool"
        :style="{
          height: '44px',
          flex: '0 0 44px',
          padding: 0,
          background: 'transparent',
          lineHeight: 'normal',
        }"
      >
        <div
          :class="styles.tools"
          @mouseenter="isHovered = true"
          @mouseleave="isHovered = false"
        >
          <OnlineStatusSwitch />
          <template v-if="isHovered">
            <MuteButton />
            <LanguageButton />
            <ThemeButton />
            <QuicDisconnectButton />
            <QuicReconnectButton />
          </template>
        </div>
        <div :class="styles.rightSideBarToolDraggable">
          <DraggableHeader />
        </div>
        <div v-if="!isConnected" :class="styles.quicReconnectTip">
          <span :class="styles.tipIcon">⚠️</span>
          <span :class="styles.tipText">
            {{ t('homeLayout.connectionDisconnected') }}
          </span>
          <div :class="styles.tipReconnectButton" @click="handleReconnect">
            <ReloadOutlined :spin="isReconnecting" />
            <span>
              {{
                isReconnecting
                  ? t('homeLayout.reconnecting')
                  : t('homeLayout.reconnect')
              }}
            </span>
          </div>
        </div>
        <div :class="styles.rightSideBarToolButton">
          <div :class="styles.rightSideBarToolButtonList">
            <AnnouncementBanner />
            <div
              :class="styles.rightButton"
              @click="minimizeWindow"
              @mousedown.stop
            >
              <MinusOutlined />
            </div>
            <div
              :class="styles.rightButton"
              @click="toggleMaximize"
              @mousedown.stop
            >
              <CompressOutlined v-if="isMaximized" />
              <ExpandOutlined v-else />
            </div>
            <div
              :class="styles.rightButtonDanger"
              @click="closeWindow"
              @mousedown.stop
            >
              <CloseOutlined />
            </div>
          </div>
        </div>
      </a-layout-header>
      <a-layout-content :class="styles.rightSideBarContent">
        <router-view />
      </a-layout-content>
    </a-layout>
    <ConnectionStatusTag :status-tag="statusTag" />
    <MessageAlertBanner />
    <a-modal
      :title="t('homeLayout.closeWindow')"
      :open="closeModalVisible"
      :closable="false"
      :footer="null"
      centered
      @cancel="closeModalVisible = false"
    >
      <div style="padding: 16px 0">
        <p style="margin-bottom: 16px">{{ t('homeLayout.selectCloseMethod') }}</p>
        <div style="display: flex; gap: 12px; justify-content: center">
          <a-button @click="hideToTray">
            {{ t('homeLayout.minimizeToTray') }}
          </a-button>
          <a-button danger type="primary" @click="quitApp">
            {{ t('homeLayout.quitApp') }}
          </a-button>
        </div>
      </div>
    </a-modal>
    <a-modal
      :title="t('homeLayout.forceLogoutTitle')"
      :open="forceLogoutVisible"
      :ok-text="t('homeLayout.forceLogout')"
      :cancel-button-props="{ style: { display: 'none' } }"
      :closable="false"
      :mask-closable="false"
      centered
      @ok="confirmForceLogout"
    >
      <p style="padding: 16px 0">
        {{ forceLogoutReason || t('homeLayout.forceLogoutContent') }}
      </p>
    </a-modal>
  </a-layout>
</template>
