<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import styles from './styles/Splitter.module.less';

const props = withDefaults(
  defineProps<{
    minHeight?: number;
    maxHeight?: number;
  }>(),
  {
    minHeight: 20,
    maxHeight: 80,
  },
);

const emit = defineEmits<{
  (e: 'height-change', height: number): void;
}>();

const isDragging = ref(false);
const splitterRef = ref<HTMLDivElement>();

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;

  const containerHeight = window.innerHeight;
  const mouseY = e.clientY;

  // 计算相对于容器的高度百分比
  const heightPercent = ((containerHeight - mouseY) / containerHeight) * 100;

  // 限制在最小和最大高度之间
  const clampedHeight = Math.max(
    props.minHeight,
    Math.min(props.maxHeight, heightPercent),
  );

  emit('height-change', clampedHeight);
};

const handleMouseUp = () => {
  isDragging.value = false;
};

const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault();
  isDragging.value = true;
};

watch(isDragging, (dragging) => {
  if (dragging) {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  } else {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div
    ref="splitterRef"
    :class="[styles.splitter, isDragging ? styles.dragging : '']"
    @mousedown="handleMouseDown"
  >
    <div :class="styles.handle" />
  </div>
</template>
