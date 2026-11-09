<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import styles from './index.module.less';

const router = useRouter();

const visible = ref(false);
const expanded = ref(false);
const url = ref('');
const position = reactive({ x: 20, y: 100 });
const isDragging = ref(false);
const dragStart = reactive({ x: 0, y: 0 });
const hasDragged = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);
const clickTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const lastClickTime = ref(0);

const handleMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (
    target.closest(`.${styles.switchWrapper}`) ||
    target.closest(`.${styles.inputWrapper}`)
  ) {
    return;
  }
  isDragging.value = true;
  hasDragged.value = false;
  dragStart.x = e.clientX - position.x;
  dragStart.y = e.clientY - position.y;
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;

  const newX = e.clientX - dragStart.x;
  const newY = e.clientY - dragStart.y;

  if (Math.abs(newX - position.x) > 3 || Math.abs(newY - position.y) > 3) {
    hasDragged.value = true;
  }

  position.x = newX;
  position.y = newY;
};

const handleMouseUp = () => {
  isDragging.value = false;
};

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  if (clickTimer.value) {
    clearTimeout(clickTimer.value);
    clickTimer.value = null;
  }
});

const handleKeyPress = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && url.value.trim()) {
    let targetUrl = url.value.trim();
    if (!targetUrl.startsWith('/')) {
      targetUrl = '/' + targetUrl;
    }
    router.push(targetUrl);
    expanded.value = false;
  }
};

const handleToggle = (checked: boolean) => {
  visible.value = checked;
  if (!checked) {
    expanded.value = false;
  }
};

const handleExpand = () => {
  expanded.value = !expanded.value;
};

const handleMiniClick = () => {
  if (hasDragged.value) {
    return;
  }

  const now = Date.now();
  if (now - lastClickTime.value < 300) {
    if (clickTimer.value) {
      clearTimeout(clickTimer.value);
      clickTimer.value = null;
    }
    visible.value = true;
  } else {
    lastClickTime.value = now;
  }
};

const handleMiniDoubleClick = () => {
  visible.value = true;
};
</script>

<template>
  <div
    v-if="!visible"
    :class="styles.miniToggle"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @mousedown="handleMouseDown"
  >
    <a-tooltip title="双击打开开发助手" placement="left">
      <div
        :class="styles.miniBtn"
        @click="handleMiniClick"
        @dblclick="handleMiniDoubleClick"
      >
        D
      </div>
    </a-tooltip>
  </div>

  <div
    v-else
    ref="containerRef"
    :class="styles.container"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @mousedown="handleMouseDown"
  >
    <div :class="styles.header">
      <span :class="styles.title">Dev Assistant</span>
      <div :class="styles.switchWrapper">
        <a-switch size="small" :checked="visible" @change="handleToggle" />
      </div>
    </div>

    <div :class="styles.body">
      <div :class="styles.expandBtn" @click="handleExpand">
        {{ expanded ? '收起' : '跳转URL' }}
      </div>

      <div v-if="expanded" :class="styles.inputWrapper">
        <a-input
          v-model:value="url"
          placeholder="输入路由路径，如 /home/chats"
          size="small"
          autofocus
          @press-enter="handleKeyPress"
        />
      </div>
    </div>
  </div>
</template>
