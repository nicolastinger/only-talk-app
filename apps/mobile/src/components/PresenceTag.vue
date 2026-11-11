<script setup lang="ts">
import { computed } from "vue";
import type { PresenceVO } from "@workspace/types";
import { useI18n } from "@/i18n";
import { isPresenceExpired } from "@/stores/presence";

const props = withDefaults(
  defineProps<{
    presence?: PresenceVO | null;
    size?: "small" | "default";
  }>(),
  { presence: null, size: "small" }
);

const { t } = useI18n();

/** 各状态的配色与文案 key(自定义状态直接展示 text) */
const PRESENCE_META: Record<string, { color: string; labelKey: string }> = {
  busy: { color: "#ff4d4f", labelKey: "onlineStatus.busy" },
  away: { color: "#faad14", labelKey: "onlineStatus.away" },
  studying: { color: "#1890ff", labelKey: "onlineStatus.studying" },
  working: { color: "#fa8c16", labelKey: "onlineStatus.working" },
  custom: { color: "#8c8c8c", labelKey: "onlineStatus.custom" },
};

const active = computed(
  () =>
    !!props.presence &&
    props.presence.mode !== "online" &&
    !isPresenceExpired(props.presence)
);

const meta = computed(
  () => PRESENCE_META[props.presence?.mode || "custom"] || PRESENCE_META.custom
);

const label = computed(() => {
  const presence = props.presence;
  if (!presence || !active.value) return "";
  return presence.mode === "custom" && presence.text
    ? presence.text
    : t(meta.value.labelKey);
});
</script>

<template>
  <span
    v-if="label"
    class="presence-tag"
    :class="{ 'presence-tag--default': size === 'default' }"
    :style="{ color: meta.color, backgroundColor: meta.color + '14' }"
  >
    <i class="presence-dot" :style="{ backgroundColor: meta.color }"></i>
    <span class="presence-text">{{ label }}</span>
  </span>
</template>

<style scoped lang="less">
.presence-tag {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 8px;
  overflow: hidden;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  border-radius: 999px;

  &--default {
    padding: 2px 10px;
    font-size: 12px;
    line-height: 18px;
  }
}

.presence-dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.presence-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
