<script setup lang="ts">
/**
 * 来电弹窗：对方发起视频通话邀请
 */
import { useI18n } from '@/i18n';
import type { VideoCallInvite } from '@workspace/types';

defineProps<{
  open: boolean;
  invite: VideoCallInvite | null;
}>();

defineEmits<{
  (e: 'accept'): void;
  (e: 'reject'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <a-modal
    :title="t('privacyChat.videoCallInvite')"
    :open="open"
    :closable="false"
    :ok-text="t('privacyChat.accept')"
    :cancel-text="t('privacyChat.reject')"
    @ok="$emit('accept')"
    @cancel="$emit('reject')"
  >
    <p>
      {{ invite?.from_name || t('privacyChat.other') }}
      {{ t('privacyChat.inviteToVideoCall') }}
    </p>
  </a-modal>
</template>
