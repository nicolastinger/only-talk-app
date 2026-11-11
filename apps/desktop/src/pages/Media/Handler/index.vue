<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  CheckOutlined,
  CloseOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { get_user_info_with_cache } from '@workspace/services';
import type { P2pInitMsg, UserInfo } from '@workspace/types';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useAvatarMap } from '@/hooks/useAvatarMap';
import { useI18n } from '@/i18n';
import { useBearStore } from '@/stores/app';
import styles from './index.module.less';

//用户视频接收处理组件
const { t } = useI18n();
const route = useRoute();
const store = useBearStore();
const requestMediaMsg = computed(() => store.requestMediaMsg);

console.log('requestMediaMsg', store.requestMediaMsg);
const userInfo = ref<UserInfo | null>(null);
const localP2pInitMsg = ref<P2pInitMsg | null>(null);
// 仅写入未被读取，保留占位以对应源实现
const localMediaType = ref<number>(0);

const currentWindow = getCurrentWindow();

// 请求方 UUID（优先 URL 参数，其次 store）
const requestUuid = computed(
  () =>
    localP2pInitMsg.value?.request_uuid ||
    requestMediaMsg.value?.p2pInitMsg?.request_uuid ||
    '',
);

// 请求方头像 bizId 列表（保持响应式，供 useAvatarMap 追踪）
const iconBizIds = reactive<Array<string | undefined>>([]);
const { avatarMap } = useAvatarMap(iconBizIds);
watch(
  () => userInfo.value?.icon,
  (icon) => {
    iconBizIds.splice(0, iconBizIds.length, icon);
  },
  { immediate: true },
);

// 请求方头像地址（icon bizId → 可显示文件路径）
const friendAvatar = computed(
  () => avatarMap.value.get(userInfo.value?.icon || '') || '',
);

// 加载请求方用户信息（昵称、头像）
watch(
  requestUuid,
  async (uuid, _old, onCleanup) => {
    if (!uuid) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    try {
      const result = await get_user_info_with_cache(uuid);
      if (!cancelled) {
        userInfo.value = result.user_info;
      }
    } catch (e) {
      console.error('[Handler] 获取请求方用户信息失败:', e);
    }
  },
  { immediate: true },
);

const getQueryString = (value: unknown): string =>
  Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

onMounted(() => {
  // 从URL参数读取数据
  const p2pInitMsgParam = getQueryString(route.query.p2pInitMsg);
  const mediaTypeParam = getQueryString(route.query.mediaType);

  if (p2pInitMsgParam) {
    try {
      const p2pInitMsg = JSON.parse(p2pInitMsgParam) as P2pInitMsg;
      localP2pInitMsg.value = p2pInitMsg;
      console.log('从URL参数读取到p2pInitMsg:', p2pInitMsg);
    } catch (e) {
      console.error('解析URL参数失败:', e);
    }
  }

  if (mediaTypeParam) {
    localMediaType.value = parseInt(mediaTypeParam);
  }
});

// 接受好友视频/音频请求
const confirm = async () => {
  // 优先使用本地状态，如果没有则使用store中的状态
  const p2pInitMsg =
    localP2pInitMsg.value || store.requestMediaMsg.p2pInitMsg;

  p2pInitMsg.accept = true;
  try {
    await invoke('process_init_p2p_request', {
      p2pInitMsg: JSON.stringify(p2pInitMsg),
    });
    // 隐私聊天窗口由主窗口监听 p2p_ready 后统一打开
    await currentWindow.close();
  } catch (e) {
    console.log('处理请求失败', e);
  }
};

// 拒绝请求
const cancel = async () => {
  //TODO
  await currentWindow.close();
};

watch(
  [requestMediaMsg, localP2pInitMsg],
  () => {
    // 监听requestMediaMsg的变化（作为备用）
    console.log('Handler组件接收到新的requestMediaMsg:', requestMediaMsg.value);

    // TODO获取好友信息
    // 这里可以根据requestMediaMsg中的信息来获取好友信息
    const p2pInitMsg =
      localP2pInitMsg.value || store.requestMediaMsg.p2pInitMsg;
    if (p2pInitMsg?.request_addr) {
      // 根据request_addr获取好友信息
      // setUserInfo(friendInfo);
    }
  },
);

const handleAvatarError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <!-- 如果没有任何数据，显示加载状态 -->
  <div v-if="!localP2pInitMsg && !store.requestMediaMsg?.p2pInitMsg" :class="styles.container">
    <div :class="styles.content">
      <div>{{ t('media.loading') }}</div>
    </div>
  </div>

  <div v-else :class="styles.container">
    <div :class="styles.content">
      <div :class="styles.left">
        <div :class="styles.avatarWrap">
          <img
            :src="friendAvatar || DEFAULT_ICON"
            :alt="t('media.userAvatar')"
            :class="styles.imgItem"
            @error="handleAvatarError"
          />
        </div>
      </div>
      <div :class="styles.right">
        <div :class="styles.name">
          {{ userInfo?.username || t('media.defaultUserName') }}
          <UserTypeTag :type="userInfo?.user_type" />
        </div>
        <div :class="styles.text">
          <VideoCameraOutlined :class="styles.textIcon" />
          {{ t('media.privacyModeRequest') }}
        </div>
        <div :class="styles.btn">
          <div :class="styles.cancelBtn">
            <a-button danger shape="circle" @click="cancel">
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>
          <div :class="styles.confirmBtn">
            <a-button type="primary" shape="circle" @click="confirm">
              <template #icon><CheckOutlined /></template>
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
