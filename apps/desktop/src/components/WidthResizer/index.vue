<script setup lang="ts">
/**
 * 左右分栏的宽度拖拽条（竖直分隔线）。
 *
 * - 拖拽时通过 `v-model` 实时更新左侧面板宽度；
 * - 拖拽结束 / 双击复位时触发 `change`，由父组件持久化；
 * - 宽度会按 min/max 以及「右侧至少保留 minRight」双重约束；
 * - 容器尺寸变化（窗口缩放）时自动把超限宽度收回。
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    /** 当前左侧面板宽度(px) */
    modelValue: number;
    /** 左侧最小宽度(px) */
    min?: number;
    /** 左侧最大宽度(px) */
    max?: number;
    /** 拖拽时右侧至少保留的宽度(px) */
    minRight?: number;
    /** 双击复位的宽度(px) */
    defaultWidth?: number;
  }>(),
  {
    min: 220,
    max: 520,
    minRight: 360,
    defaultWidth: 300,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  /** 拖拽结束 / 双击复位 / 容器挤压后触发，用于持久化 */
  (e: 'change', value: number): void;
}>();

const { t } = useI18n();

const rootRef = ref<HTMLDivElement>();
const dragging = ref(false);

let startX = 0;
let startWidth = 0;
let latestWidth = props.modelValue;
let containerWidth = 0;
let observer: ResizeObserver | null = null;

/** 同时受 min/max 与右侧保留宽度约束 */
const clamp = (value: number): number => {
  const byContainer =
    containerWidth > 0 ? containerWidth - props.minRight : props.max;
  const max = Math.max(props.min, Math.min(props.max, byContainer));
  return Math.round(Math.min(max, Math.max(props.min, value)));
};

const applyWidth = (value: number, persist: boolean) => {
  latestWidth = value;
  emit('update:modelValue', value);
  if (persist) emit('change', value);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!dragging.value) return;
  applyWidth(clamp(startWidth + e.clientX - startX), false);
};

const stopDrag = () => {
  if (!dragging.value) return;
  dragging.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('blur', stopDrag);
  document.body.style.removeProperty('cursor');
  document.body.style.removeProperty('user-select');
  applyWidth(latestWidth, true);
};

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const parent = (e.currentTarget as HTMLElement).parentElement;
  containerWidth = parent?.clientWidth ?? 0;
  startX = e.clientX;
  startWidth = props.modelValue;
  latestWidth = props.modelValue;
  dragging.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);
  // 拖拽期间锁定指针与文本选择，避免选中列表文字
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

/** 双击恢复默认宽度 */
const resetWidth = () => {
  const parent = rootRef.value?.parentElement;
  containerWidth = parent?.clientWidth ?? 0;
  applyWidth(clamp(props.defaultWidth), true);
};

onMounted(() => {
  const parent = rootRef.value?.parentElement;
  if (!parent || typeof ResizeObserver === 'undefined') return;
  // 容器变窄时(窗口缩放)把面板宽度收回，避免右侧被挤没
  observer = new ResizeObserver(() => {
    containerWidth = parent.clientWidth;
    const next = clamp(props.modelValue);
    // 只收窄当前显示宽度，不改写用户保存的偏好
    if (next !== props.modelValue) applyWidth(next, false);
  });
  observer.observe(parent);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('blur', stopDrag);
  document.body.style.removeProperty('cursor');
  document.body.style.removeProperty('user-select');
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div
    ref="rootRef"
    :class="[styles.resizer, dragging ? styles.dragging : '']"
    role="separator"
    aria-orientation="vertical"
    :title="t('common.dragToResize')"
    @mousedown="startDrag"
    @dblclick="resetWidth"
  />
</template>
