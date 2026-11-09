<script setup lang="ts">
/**
 * 响铃/呼叫遮罩：发起方等待对方接听、被邀请方等待接听
 */
import { DEFAULT_ICON } from '@/constants';
import { PhoneOutlined } from '@ant-design/icons-vue';
import styles from '../index.module.less';

defineProps<{
  friendAvatar: string;
  friendName: string;
  isWaitingResponse: boolean;
}>();

defineEmits<{ (e: 'cancel'): void }>();

const handleAvatarError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  target.src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.ringOverlay">
    <div :class="styles.ringContent">
      <div :class="styles.ringAvatarWrap">
        <img
          :class="styles.ringAvatar"
          :src="friendAvatar || DEFAULT_ICON"
          alt="avatar"
          @error="handleAvatarError"
        />
      </div>
      <div :class="styles.ringName">{{ friendName }}</div>
      <div :class="styles.ringStatus">
        {{ isWaitingResponse ? '正在呼叫对方...' : '等待对方接听...' }}
      </div>
      <div :class="styles.ringActions">
        <a-tooltip title="取消通话">
          <a-button
            type="primary"
            danger
            shape="circle"
            size="large"
            :class="styles.ringCancelBtn"
            @click="$emit('cancel')"
          >
            <template #icon><PhoneOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
    </div>
  </div>
</template>
