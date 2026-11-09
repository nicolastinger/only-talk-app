<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from '@/i18n';
import styles from './styles/MessageActionMenu.module.less';

type MessageAction = 'multi' | 'forward' | 'recall' | 'delete' | 'copy';

const props = defineProps<{
  x: number;
  y: number;
  canCopy?: boolean;
  canRecall?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', action: MessageAction): void;
  (e: 'close'): void;
}>();

const EDGE_PADDING = 8;
const { t } = useI18n();
const menuRef = ref<HTMLDivElement>();
// 文档坐标系（绝对定位基于 body）
const pos = reactive({ left: props.x, top: props.y });

const measure = () => {
  const el = menuRef.value;
  if (!el) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const rect = el.getBoundingClientRect();
  let left = props.x + scrollX;
  let top = props.y + scrollY;

  if (props.x + rect.width + EDGE_PADDING > window.innerWidth) {
    left = Math.max(scrollX + EDGE_PADDING, props.x + scrollX - rect.width);
  }
  if (props.y + rect.height + EDGE_PADDING > window.innerHeight) {
    top = Math.max(scrollY + EDGE_PADDING, props.y + scrollY - rect.height);
  }
  pos.left = left;
  pos.top = top;
};

const items = computed(() => {
  const list: { key: MessageAction; label: string }[] = [
    {
      key: 'multi',
      label: t('chat.messageActions.multiSelect'),
    },
    {
      key: 'forward',
      label: t('chat.messageActions.forward'),
    },
  ];
  if (props.canRecall) {
    list.push({
      key: 'recall',
      label: t('chat.messageActions.recall'),
    });
  }
  list.push({
    key: 'delete',
    label: t('chat.messageActions.delete'),
  });
  if (props.canCopy) {
    list.push({
      key: 'copy',
      label: t('chat.messageActions.copy'),
    });
  }
  return list;
});

const handleClick = (e: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) emit('close');
};
const handleKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};
const handleClose = () => emit('close');

onMounted(() => {
  nextTick(measure);
  document.addEventListener('mousedown', handleClick);
  document.addEventListener('contextmenu', handleClick);
  document.addEventListener('keydown', handleKey);
  window.addEventListener('scroll', handleClose, true);
  window.addEventListener('resize', handleClose);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClick);
  document.removeEventListener('contextmenu', handleClick);
  document.removeEventListener('keydown', handleKey);
  window.removeEventListener('scroll', handleClose, true);
  window.removeEventListener('resize', handleClose);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      :class="styles.menu"
      :style="{ left: pos.left, top: pos.top }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <div
        v-for="item in items"
        :key="item.key"
        :class="styles.item"
        @click="emit('select', item.key)"
      >
        {{ item.label }}
      </div>
    </div>
  </Teleport>
</template>
