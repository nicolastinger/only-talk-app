<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ImagePreview from '@/components/ImagePreview/index.vue';
import styles from './index.module.less';

const route = useRoute();
const router = useRouter();
const imagePaths = ref<string[]>([]);
const currentIndex = ref(0);

const getQueryString = (value: unknown): string =>
  Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

const parseParams = () => {
  const imagesParam = getQueryString(route.query.images);
  const indexParam = getQueryString(route.query.index);

  console.log('Raw images param:', imagesParam);

  if (imagesParam && imagesParam.length > 0) {
    try {
      let decodedParam = imagesParam;
      while (/%25[0-9A-F]{2}/i.test(decodedParam)) {
        decodedParam = decodeURIComponent(decodedParam);
      }
      const paths = JSON.parse(decodedParam) as string[];
      console.log('Parsed image paths:', paths);
      imagePaths.value = paths;
      if (indexParam) {
        currentIndex.value = parseInt(indexParam, 10);
      }
    } catch (error) {
      console.error('Failed to parse image paths:', error);
    }
  }
};

watch(() => route.fullPath, parseParams, { immediate: true });

const handleClose = () => {
  router.back();
};
</script>

<template>
  <div v-if="imagePaths.length > 0" :class="styles.container">
    <ImagePreview
      :image-paths="imagePaths"
      :current-index="currentIndex"
      :on-close="handleClose"
    />
  </div>
</template>
