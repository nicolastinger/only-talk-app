<script setup lang="ts">
/**
 * 呼叫提示界面（来电/去电/被拒）
 *
 * 现代化布局：模糊头像背景 + 光晕头像 + 名称与状态文案 + 圆形操作按钮。
 * 语音通话（无视频）时同样复用该界面，仅文案与图标不同。
 */
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import {
  AudioOutlined,
  CloseOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import { computed } from 'vue';
import styles from '../index.module.less';

type CallStage =
  | 'incoming'
  | 'outgoing'
  | 'connecting'
  | 'connected'
  | 'rejected'
  | 'ended';

const props = defineProps<{
  callStage: CallStage;
  friendName?: string;
  friendAvatar?: string;
  isVideoCall: boolean;
}>();

defineEmits<{
  (e: 'accept'): void;
  (e: 'reject'): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();

const avatar = computed(() => props.friendAvatar || DEFAULT_ICON);
const mediaLabel = computed(() =>
  t(props.isVideoCall ? 'chat.tools.video' : 'chat.tools.audio'),
);

const stageText = computed(() => {
  if (props.callStage === 'incoming') {
    return t(props.isVideoCall ? 'call.incomingVideo' : 'call.incomingAudio');
  }
  if (props.callStage === 'outgoing') {
    return t('call.outgoing');
  }
  if (props.callStage === 'rejected') {
    return t('webRTCMessage.rejected');
  }
  return t('call.ended');
});

const backdropStyle = computed(() => ({
  backgroundImage: `url("${props.friendAvatar || ''}")`,
}));
</script>

<template>
  <div :class="styles.callScreen">
    <div
      v-if="friendAvatar"
      :class="styles.callScreenBackdrop"
      :style="backdropStyle"
    />

    <div :class="styles.callScreenContent">
      <div :class="styles.callAvatarHalo">
        <span :class="styles.callAvatarRing" />
        <span :class="styles.callAvatarRingSlow" />
        <img :class="styles.callAvatar" :src="avatar" alt="" />
        <span :class="styles.callAvatarMedia">
          <VideoCameraOutlined v-if="isVideoCall" />
          <AudioOutlined v-else />
        </span>
      </div>

      <div :class="styles.callName">{{ friendName || mediaLabel }}</div>
      <div :class="styles.callMediaLabel">{{ mediaLabel }}</div>
      <div :class="styles.callStageText">{{ stageText }}</div>

      <div v-if="callStage === 'incoming'" :class="styles.callActions">
        <div :class="styles.callActionItem">
          <button
            type="button"
            :class="[styles.callAction, styles.callActionReject]"
            @click="$emit('reject')"
          >
            <CloseOutlined />
          </button>
          <span :class="styles.callActionLabel">{{ t('call.decline') }}</span>
        </div>
        <div :class="styles.callActionItem">
          <button
            type="button"
            :class="[styles.callAction, styles.callActionAccept]"
            @click="$emit('accept')"
          >
            <PhoneOutlined :rotate="135" />
          </button>
          <span :class="styles.callActionLabel">{{ t('call.accept') }}</span>
        </div>
      </div>
      <div v-else-if="callStage === 'outgoing'" :class="styles.callActions">
        <div :class="styles.callActionItem">
          <button
            type="button"
            :class="[styles.callAction, styles.callActionReject]"
            @click="$emit('cancel')"
          >
            <PhoneOutlined :rotate="135" />
          </button>
          <span :class="styles.callActionLabel">{{ t('call.hangup') }}</span>
        </div>
      </div>
      <div v-else :class="styles.callRingingDots">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
</template>
