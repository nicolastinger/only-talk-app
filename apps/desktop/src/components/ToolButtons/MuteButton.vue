<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { SoundOutlined, StopOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import {
  isMessageSoundEnabled,
  playMessageSound,
  setMessageSoundEnabled,
  subscribeMessageSoundChange,
} from '@workspace/services';
import styles from './MuteButton.module.less';

const { t } = useI18n();
const muted = ref(!isMessageSoundEnabled());

const off = subscribeMessageSoundChange((enabled) => {
  muted.value = !enabled;
});
onUnmounted(() => off());

const toggleMute = () => {
  const nextEnabled = muted.value;
  setMessageSoundEnabled(nextEnabled)
    .then(() => {
      if (nextEnabled) playMessageSound();
    })
    .catch(() => {});
};

const tooltip = () =>
  t(muted.value ? 'homeLayout.unmuteSound' : 'homeLayout.muteSound');
</script>

<template>
  <a-tooltip :title="tooltip()" placement="bottom">
    <div
      :class="[styles.muteButton, muted ? styles.muted : '']"
      @click="toggleMute"
    >
      <StopOutlined v-if="muted" />
      <SoundOutlined v-else />
    </div>
  </a-tooltip>
</template>
