<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { UserOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import { subscribe } from '@workspace/services';
import { DEFAULT_ICON } from '@/constants';
import { useAvatarMap } from '@/hooks/useAvatarMap';

interface AlertPayload {
  is_group: boolean;
  target: string;
  title: string;
  sender_name?: string;
  icon?: string;
  body: string;
}

const AUTO_HIDE_MS = 6000;
const router = useRouter();

const alert = ref<AlertPayload | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let off: (() => void) | undefined;

const setForeground = (value: '1' | '0') => {
  invoke('add_user_map', { map: { app_foreground: value } }).catch(() => {});
};

const onFocus = () => setForeground('1');
const onBlur = () => setForeground('0');
const onVisibility = () =>
  setForeground(document.visibilityState === 'visible' ? '1' : '0');

onMounted(() => {
  setForeground('1');
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  off = subscribe('alert_incoming_message', (payloadRaw) => {
    try {
      const payload: AlertPayload =
        typeof payloadRaw === 'string'
          ? JSON.parse(payloadRaw)
          : (payloadRaw as AlertPayload);
      if (!payload?.target) return;
      alert.value = payload;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        alert.value = null;
      }, AUTO_HIDE_MS);
    } catch (e) {
      console.error('解析新消息提醒失败', e);
    }
  });
});

onUnmounted(() => {
  off?.();
  if (timer) clearTimeout(timer);
  window.removeEventListener('focus', onFocus);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('visibilitychange', onVisibility);
});

const { avatarMap } = useAvatarMap([alert.value?.icon]);
const avatarUrl = computed(() =>
  alert.value?.icon ? avatarMap.value.get(alert.value.icon) : undefined,
);

const displayName = computed(
  () => alert.value?.sender_name || alert.value?.title || '',
);
const showGroupName = computed(
  () =>
    !!alert.value?.is_group &&
    !!alert.value?.title &&
    alert.value.title !== displayName.value,
);

const openSession = () => {
  if (!alert.value) return;
  const path = alert.value.is_group
    ? `/home/chats/group-chat?groupId=${encodeURIComponent(alert.value.target)}`
    : `/home/chats/chat?currentFriend=${encodeURIComponent(alert.value.target)}`;
  router.push(path);
  alert.value = null;
};

const startHideTimer = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    alert.value = null;
  }, AUTO_HIDE_MS);
};

const clearHideTimer = () => {
  if (timer) clearTimeout(timer);
};
</script>

<template>
  <div
    v-if="alert"
    style="
      position: fixed;
      top: 56px;
      right: 16px;
      z-index: 9999;
      width: 320px;
      max-width: calc(100vw - 32px);
      padding: 12px 14px;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.16);
      border: 1px solid #e6e6e6;
      cursor: pointer;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    "
    @click="openSession"
    @mouseenter="clearHideTimer"
    @mouseleave="startHideTimer"
  >
    <a-avatar
      :size="40"
      shape="square"
      :src="avatarUrl || DEFAULT_ICON"
      style="flex-shrink: 0"
    >
      <template #icon><UserOutlined /></template>
    </a-avatar>
    <div style="min-width: 0; flex: 1">
      <div
        style="
          font-size: 13px;
          font-weight: 600;
          color: #111;
          word-break: break-word;
        "
      >
        {{ displayName }}
        <span v-if="showGroupName" style="color: #999; font-weight: 400">
          · {{ alert.title }}
        </span>
      </div>
      <div
        style="
          font-size: 12px;
          color: #666;
          margin-top: 2px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
        "
      >
        {{ alert.body }}
      </div>
    </div>
    <span
      style="color: #bbb; font-size: 14px; line-height: 1"
      @click.stop="alert = null"
    >
      ✕
    </span>
  </div>
</template>
