<script setup lang="ts">
import AvatarCropModal from './index.vue';
import { useAvatarCropper } from '@/hooks/useAvatarCropper';

const { cropSrc, handleConfirm, handleCancel } = useAvatarCropper();
</script>

<template>
  <AvatarCropModal
    :open="!!cropSrc"
    :src="cropSrc || ''"
    @cancel="handleCancel"
    @confirm="handleConfirm"
  />
</template>
