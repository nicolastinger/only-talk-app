<script setup lang="ts">
import type { StyleValue } from 'vue';
import { DEFAULT_ICON } from '@/constants';

withDefaults(
  defineProps<{
    width?: string | number;
    height?: string | number;
    style?: StyleValue;
    className?: string;
    alt?: string;
  }>(),
  {
    width: 200,
    height: 200,
    alt: 'Local Image',
  },
);
</script>

<template>
  <img
    :src="DEFAULT_ICON"
    :alt="alt"
    :width="width"
    :height="height"
    :style="[{ objectFit: 'cover' }, style]"
    :class="className"
  />
</template>
