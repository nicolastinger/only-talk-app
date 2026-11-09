<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StyleValue } from 'vue';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    src: string | null;
    alt?: string;
    loading?: boolean;
    maxWidth?: number | string;
    maxHeight?: number | string;
    borderRadius?: number | string;
    objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    className?: string;
    style?: StyleValue;
    errorText?: string;
    loadingText?: string;
    fill?: boolean;
  }>(),
  {
    alt: '图片',
    objectFit: 'contain',
    errorText: '图片加载失败',
    loadingText: '加载中...',
    fill: false,
  },
);

const emit = defineEmits<{
  (e: 'load'): void;
  (e: 'error'): void;
}>();

const loaded = ref(false);
const failed = ref(false);

watch(
  () => props.src,
  (src) => {
    if (src) {
      loaded.value = false;
      failed.value = false;
    }
  },
);

const stateStyle = computed<StyleValue>(() => ({
  maxWidth: props.maxWidth,
  maxHeight: props.maxHeight,
  borderRadius: props.borderRadius,
  ...(typeof props.style === 'object' && props.style ? props.style : {}),
}));

const imgStyle = computed<StyleValue>(() => ({
  maxWidth: props.maxWidth,
  maxHeight: props.maxHeight,
  borderRadius: props.borderRadius,
  objectFit: props.objectFit,
  cursor: 'pointer',
  ...(typeof props.style === 'object' && props.style ? props.style : {}),
}));

const handleLoad = async (e: Event) => {
  try {
    await (e.currentTarget as HTMLImageElement).decode();
  } catch {
    failed.value = true;
    emit('error');
    return;
  }
  loaded.value = true;
  emit('load');
};

const handleError = () => {
  failed.value = true;
  emit('error');
};
</script>

<template>
  <div
    v-if="!src"
    :class="[styles.state, className]"
    :style="stateStyle"
  >
    <span>{{ loading ? loadingText : errorText }}</span>
  </div>
  <div
    v-else-if="failed"
    :class="[styles.state, className]"
    :style="stateStyle"
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-8-4h2v2h-2v-2zm0-6h2v4h-2V9z"
      />
    </svg>
    <span>{{ errorText }}</span>
  </div>
  <div v-else-if="fill" :class="[styles.fillWrap, className]">
    <img
      :src="src"
      :alt="alt"
      :class="styles.imgFill"
      :style="imgStyle"
      @load="handleLoad"
      @error="handleError"
    />
    <div v-if="loading && !loaded" :class="styles.overlay">
      <span>{{ loadingText }}</span>
    </div>
  </div>
  <img
    v-else
    :src="src"
    :alt="alt"
    :class="[styles.img, className]"
    :style="imgStyle"
    @load="handleLoad"
    @error="handleError"
  />
</template>
