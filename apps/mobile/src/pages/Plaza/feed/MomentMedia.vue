<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const props = withDefaults(
  defineProps<{
    images: string[];
    height?: number;
  }>(),
  { height: 260 }
);

const wrapRef = ref<HTMLElement | null>(null);
const index = ref(0);
const count = computed(() => props.images.length);

const onScroll = () => {
  const el = wrapRef.value;
  if (!el) return;
  const slideWidth = el.clientWidth;
  index.value = slideWidth > 0 ? Math.round(el.scrollLeft / slideWidth) : 0;
};

const scrollTo = (i: number) => {
  const el = wrapRef.value;
  if (!el) return;
  el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
};

onMounted(onScroll);
</script>

<template>
  <div class="m-media">
    <div
      ref="wrapRef"
      class="m-scroll"
      :style="{ height: `${height}px` }"
      @scroll.passive="onScroll"
    >
      <div v-for="(img, i) in images" :key="i" class="m-slide">
        <img
          :src="img"
          class="m-img"
          draggable="false"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
      </div>
    </div>

    <button
      v-if="count > 1 && index > 0"
      class="nav prev"
      @click.stop="scrollTo(index - 1)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
    </button>
    <button
      v-if="count > 1 && index < count - 1"
      class="nav next"
      @click.stop="scrollTo(index + 1)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
      </svg>
    </button>

    <span v-if="count > 1" class="counter">{{ index + 1 }}/{{ count }}</span>
  </div>
</template>

<style scoped lang="less">
.m-media {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-hover);
}

.m-scroll {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.m-slide {
  flex-shrink: 0;
  width: 100%;
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  justify-content: center;
}

.m-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 18px;
    height: 18px;
  }

  &.prev {
    left: 8px;
  }

  &.next {
    right: 8px;
  }
}

.counter {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
}
</style>
