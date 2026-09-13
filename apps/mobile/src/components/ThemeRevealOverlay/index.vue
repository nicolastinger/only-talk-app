<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { endReveal, themeReveal } from "@/stores/theme";

// 初始为全覆盖(半径150%)，两帧后收缩为0，clip-path 过渡形成收缩揭示效果
const radius = ref("150%");

watch(
  () => themeReveal.value.key,
  async () => {
    if (!themeReveal.value.active) return;
    radius.value = "150%";
    await nextTick();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        radius.value = "0%";
      });
    });
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="themeReveal.active"
    class="theme-reveal"
    :style="{
      background: themeReveal.color,
      clipPath: `circle(${radius} at ${themeReveal.x}px ${themeReveal.y}px)`,
    }"
    @transitionend="endReveal"
  />
</template>

<style scoped>
.theme-reveal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  transition: clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>