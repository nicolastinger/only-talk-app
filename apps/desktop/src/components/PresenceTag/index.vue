<script setup lang="ts">
import { computed } from 'vue';
import { isPresenceExpired } from '@/stores/presence';
import { useI18n } from '@/i18n';
import type { PresenceMode, PresenceVO } from '@workspace/types';
import { PRESENCE_META } from './meta';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    presence?: PresenceVO | null;
    /** 资料卡等大号场景用 default */
    size?: 'small' | 'default';
  }>(),
  {
    presence: null,
    size: 'small',
  },
);

const { t } = useI18n();

const visible = computed(
  () =>
    !!props.presence &&
    props.presence.mode !== 'online' &&
    !isPresenceExpired(props.presence),
);

const meta = computed(() => {
  if (!props.presence) return PRESENCE_META.custom;
  return (
    PRESENCE_META[props.presence.mode as Exclude<PresenceMode, 'online'>] ??
    PRESENCE_META.custom
  );
});

const label = computed(() => {
  if (!props.presence) return '';
  return props.presence.mode === 'custom' && props.presence.text
    ? props.presence.text
    : t(meta.value.labelId);
});
</script>

<template>
  <span
    v-if="visible"
    :class="[styles.tag, size === 'default' ? styles.tagDefault : '']"
    :style="{ color: meta.color, backgroundColor: `${meta.color}14` }"
    :title="label"
  >
    <span :class="styles.icon">
      <component :is="meta.icon" />
    </span>
    <span :class="styles.text">{{ label }}</span>
  </span>
</template>
