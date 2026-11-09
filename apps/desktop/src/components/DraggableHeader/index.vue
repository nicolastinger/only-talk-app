<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Window } from '@tauri-apps/api/window';

const dragElementRef = ref<HTMLDivElement | null>(null);

const handleDrag = async () => {
  await Window.getCurrent().startDragging();
};

onMounted(() => {
  dragElementRef.value?.addEventListener('mousedown', handleDrag);
});

onUnmounted(() => {
  dragElementRef.value?.removeEventListener('mousedown', handleDrag);
});
</script>

<template>
  <div ref="dragElementRef" style="width: 100%; height: 100%" />
</template>
