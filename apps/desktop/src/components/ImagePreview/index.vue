<script setup lang="ts">
import { ref, watch } from 'vue';
import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    imagePaths: string[];
    currentIndex?: number;
    onClose?: () => void;
  }>(),
  {
    currentIndex: 0,
  },
);

const { t } = useI18n();
const current = ref(props.currentIndex);
const scale = ref(1);

watch(
  () => props.currentIndex,
  (value) => {
    current.value = value;
    scale.value = 1;
  },
);

const handlePrev = () => {
  current.value =
    current.value > 0 ? current.value - 1 : props.imagePaths.length - 1;
  scale.value = 1;
};

const handleNext = () => {
  current.value =
    current.value < props.imagePaths.length - 1 ? current.value + 1 : 0;
  scale.value = 1;
};

const handleZoomIn = () => {
  scale.value = Math.min(scale.value + 0.5, 5);
};

const handleZoomOut = () => {
  scale.value = Math.max(scale.value - 0.5, 0.5);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') handlePrev();
  else if (e.key === 'ArrowRight') handleNext();
  else if (e.key === 'Escape') props.onClose?.();
  else if (e.key === '+' || e.key === '=') handleZoomIn();
  else if (e.key === '-') handleZoomOut();
};
</script>

<template>
  <div
    v-if="imagePaths.length > 0"
    :class="styles.container"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <div
      :class="styles.backgroundBlur"
      :style="{ backgroundImage: `url(${imagePaths[current]})` }"
    />
    <div :class="styles.overlay" />

    <div :class="styles.header">
      <span :class="styles.counter">
        {{ current + 1 }} / {{ imagePaths.length }}
      </span>
      <div :class="styles.headerActions">
        <a-button
          type="text"
          :class="styles.iconButton"
          :title="t('imagePreview.zoomOut')"
          @click="handleZoomOut"
        >
          <ZoomOutOutlined />
        </a-button>
        <span :class="styles.scaleText">{{ Math.round(scale * 100) }}%</span>
        <a-button
          type="text"
          :class="styles.iconButton"
          :title="t('imagePreview.zoomIn')"
          @click="handleZoomIn"
        >
          <ZoomInOutlined />
        </a-button>
      </div>
    </div>

    <div :class="styles.imageContainer">
      <div
        v-if="imagePaths.length > 1"
        :class="styles.navAreaLeft"
        @click="handlePrev"
      >
        <div :class="styles.navButton">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </div>
      </div>

      <div :class="styles.imageWrapper">
        <a-image
          :src="imagePaths[current]"
          :alt="`Image ${current + 1}`"
          :class="styles.image"
          :preview="false"
          :style="{ transform: `scale(${scale})` }"
        />
      </div>

      <div
        v-if="imagePaths.length > 1"
        :class="styles.navAreaRight"
        @click="handleNext"
      >
        <div :class="styles.navButton">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </div>
      </div>
    </div>

    <div v-if="imagePaths.length > 1" :class="styles.thumbnails">
      <div :class="styles.thumbnailScroll">
        <div
          v-for="(path, index) in imagePaths"
          :key="index"
          :class="[styles.thumbnail, index === current ? styles.active : '']"
          @click="
            () => {
              current = index;
              scale = 1;
            }
          "
        >
          <a-image
            :src="path"
            :alt="`Thumbnail ${index + 1}`"
            :class="styles.thumbnailImage"
            :preview="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>
