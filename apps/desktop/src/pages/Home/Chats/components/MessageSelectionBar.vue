<script setup lang="ts">
import { useI18n } from '@/i18n';
import styles from './styles/MessageSelectionBar.module.less';

defineProps<{
  count: number;
  allSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-all'): void;
  (e: 'cancel'): void;
  (e: 'copy'): void;
  (e: 'forward'): void;
  (e: 'delete'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div :class="styles.bar">
    <span :class="styles.info">
      {{ t('chat.selection.selected', { count }) }}
    </span>
    <a-button type="link" size="small" @click="emit('toggle-all')">
      {{ allSelected ? t('chat.selection.unselectAll') : t('chat.selection.selectAll') }}
    </a-button>
    <a-button type="link" size="small" @click="emit('cancel')">
      {{ t('chat.messageActions.cancel') }}
    </a-button>
    <div :class="styles.spacer" />
    <a-button :disabled="count === 0" @click="emit('copy')">
      {{ t('chat.messageActions.copy') }}{{ count > 0 ? `(${count})` : '' }}
    </a-button>
    <a-button type="primary" :disabled="count === 0" @click="emit('forward')">
      {{ t('chat.messageActions.forward') }}{{ count > 0 ? `(${count})` : '' }}
    </a-button>
    <a-button danger :disabled="count === 0" @click="emit('delete')">
      {{ t('chat.messageActions.delete') }}{{ count > 0 ? `(${count})` : '' }}
    </a-button>
  </div>
</template>
