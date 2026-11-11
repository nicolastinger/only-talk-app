<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import Cropper from 'cropperjs';
import { useI18n } from '@/i18n';
import type { CropRect } from '@/hooks/useAvatarCropper';
import 'cropperjs/dist/cropper.css';
import styles from './index.module.less';

const props = defineProps<{
  open: boolean;
  src: string;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm', rect: CropRect): void;
}>();

const { t } = useI18n();
const imageRef = ref<HTMLImageElement | null>(null);
const zoom = ref(1);
const confirming = ref(false);
let cropper: Cropper | null = null;

const destroy = () => {
  cropper?.destroy();
  cropper = null;
};

const init = async () => {
  await nextTick();
  destroy();
  if (!imageRef.value) return;
  cropper = new Cropper(imageRef.value, {
    aspectRatio: 1,
    viewMode: 1,
    background: false,
    autoCropArea: 1,
    zoomOnWheel: true,
    movable: true,
    zoomable: true,
    guides: false,
  });
  cropper.zoomTo(zoom.value);
};

watch(
  () => [props.open, props.src],
  ([open]) => {
    if (open) {
      init();
    } else {
      destroy();
    }
  },
  { immediate: true },
);

watch(zoom, (value) => {
  cropper?.zoomTo(value);
});

onUnmounted(destroy);

const handleConfirm = () => {
  if (!cropper) return;
  confirming.value = true;
  const data = cropper.getData(true);
  emit('confirm', {
    x: Math.round(data.x),
    y: Math.round(data.y),
    width: Math.round(data.width),
    height: Math.round(data.height),
  });
  confirming.value = false;
  zoom.value = 1;
};

const handleCancel = () => {
  zoom.value = 1;
  emit('cancel');
};
</script>

<template>
  <a-modal
    :open="open"
    :closable="false"
    :footer="null"
    :width="420"
    centered
    :mask-closable="false"
    :title="t('avatarCrop.title')"
    @cancel="handleCancel"
  >
    <div :class="styles.cropContainer">
      <img ref="imageRef" :src="src" alt="avatar" />
    </div>
    <div :class="styles.zoomControl">
      <span :class="styles.zoomLabel">{{ t('avatarCrop.zoom') }}</span>
      <a-slider
        v-model:value="zoom"
        :min="1"
        :max="3"
        :step="0.01"
        :class="styles.zoomSlider"
      />
    </div>
    <div :class="styles.footer">
      <a-button @click="handleCancel">{{ t('avatarCrop.cancel') }}</a-button>
      <a-button type="primary" :loading="confirming" @click="handleConfirm">
        {{ t('avatarCrop.confirm') }}
      </a-button>
    </div>
  </a-modal>
</template>
