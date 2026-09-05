<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps<{
  urls: string[];
  initialIndex?: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const index = ref(props.initialIndex || 0);
const touchStartX = ref(0);
const currentUrl = computed(
  () => props.urls[index.value] || ""
);
const positionText = computed(() => `${index.value + 1}/${props.urls.length}`);

const clamp = (i: number) => {
  if (props.urls.length === 0) return 0;
  if (i < 0) i = 0;
  if (i > props.urls.length - 1) i = props.urls.length - 1;
  return i;
};

const prev = () => {
  if (props.urls.length === 0) return;
  index.value = clamp(index.value - 1);
};

const next = () => {
  if (props.urls.length === 0) return;
  index.value = clamp(index.value + 1);
};

const onTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX;
};

const onTouchEnd = (e: TouchEvent) => {
  const dx = e.changedTouches[0].clientX - touchStartX.value;
  if (Math.abs(dx) > 60) {
    if (dx < 0) next();
    else prev();
  }
};
</script>

<template>
  <div class="previewer" @click="emit('close')" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <div class="previewer-nav" @click.stop>
      <button class="nav-btn" :disabled="index <= 0" @click="prev">‹</button>
    </div>
    <div class="previewer-center" @click.stop>
      <img v-if="currentUrl" :src="currentUrl" alt="图片预览" class="previewer-img" />
      <div v-else class="previewer-empty">图片不存在</div>
    </div>
    <div class="previewer-nav" @click.stop>
      <button class="nav-btn" :disabled="index >= urls.length - 1" @click="next">›</button>
    </div>
    <span class="previewer-count">{{ positionText }}</span>
    <button class="previewer-close" aria-label="关闭预览" @click.stop="emit('close')">
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path
          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="less">
.previewer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
}
.previewer-nav {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 12px;
}
.nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }
}
.previewer-center {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}
.previewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.previewer-empty {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}
.previewer-count {
  position: fixed;
  top: max(20px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  background: rgba(255, 255, 255, 0.12);
  padding: 4px 14px;
  border-radius: 12px;
}
.previewer-close {
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  right: 16px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
</style>
