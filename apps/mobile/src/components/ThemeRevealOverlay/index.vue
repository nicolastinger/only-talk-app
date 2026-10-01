<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { endReveal, themeReveal } from "@/stores/theme";

// 初始为不可见(半径0%)，两帧后扩散到150%，clip-path 过渡形成从点击点扩散的揭示效果
const radius = ref("0%");

watch(
  () => themeReveal.value.key,
  async () => {
    if (!themeReveal.value.active) return;
    radius.value = "0%";
    await nextTick();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        radius.value = "150%";
      });
    });
  },
  { immediate: true },
);

// 仅当扩散到150%（完全覆盖）时结束；快速连续切换产生的收缩过渡会被跳过
const onTransitionEnd = () => {
  if (radius.value === "150%") endReveal();
};
</script>

<template>
  <div
    v-if="themeReveal.active"
    class="theme-reveal"
    :style="{
      background: themeReveal.color,
      clipPath: `circle(${radius} at ${themeReveal.x}px ${themeReveal.y}px)`,
    }"
    @transitionend="onTransitionEnd"
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