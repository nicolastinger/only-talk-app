<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppImage from '@/components/AppImage/index.vue';
import styles from './styles/MomentMedia.module.less';

const props = defineProps<{
  images: string[];
}>();

const emit = defineEmits<{ (e: 'mediaLoad'): void }>();

const imgIndex = ref(0);
const tallestRatio = ref<number | null>(null);
let loadToken = 0;

// 预加载所有图并取最高图(高度/宽度)比例, 用于统一容器高度
watch(
  () => props.images,
  (images) => {
    const token = ++loadToken;
    tallestRatio.value = null;
    imgIndex.value = 0;
    if (images.length === 0) return;
    let max = 0;
    images.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (token !== loadToken) return;
        if (w > 0 && h > 0 && h / w > max) {
          max = h / w;
          tallestRatio.value = max;
        }
        emit('mediaLoad');
      };
      img.onerror = () => {
        if (token === loadToken) emit('mediaLoad');
      };
      img.src = src;
    });
  },
  { immediate: true },
);

const prev = (e: MouseEvent) => {
  e.stopPropagation();
  imgIndex.value = Math.max(0, imgIndex.value - 1);
};

const next = (e: MouseEvent) => {
  e.stopPropagation();
  imgIndex.value = Math.min(props.images.length - 1, imgIndex.value + 1);
};

const mediaStyle = computed(() =>
  tallestRatio.value
    ? { aspectRatio: String(1 / tallestRatio.value) }
    : undefined,
);
</script>

<template>
  <div v-if="images.length > 0" :class="styles.media" :style="mediaStyle">
    <img
      :src="images[imgIndex]"
      :class="styles.mediaBg"
      alt=""
      aria-hidden
    />
    <AppImage
      :key="imgIndex"
      :src="images[imgIndex]"
      fill
      :class="styles.mediaImg"
      @load="emit('mediaLoad')"
      @error="emit('mediaLoad')"
    />
    <template v-if="images.length > 1">
      <button
        type="button"
        :class="[styles.arrow, styles.arrowLeft]"
        :disabled="imgIndex === 0"
        @click="prev"
      >
        ‹
      </button>
      <button
        type="button"
        :class="[styles.arrow, styles.arrowRight]"
        :disabled="imgIndex === images.length - 1"
        @click="next"
      >
        ›
      </button>
      <span :class="styles.counter">{{ imgIndex + 1 }}/{{ images.length }}</span>
    </template>
  </div>
</template>
