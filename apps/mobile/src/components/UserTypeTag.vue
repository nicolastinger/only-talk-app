<script setup lang="ts">
import { computed } from "vue";

/**
 * 用户类型标签
 * 0/空: 不显示; 1: 机器人(蓝); 2: 企业(金); 其他非0: 特殊(灰)
 */
const props = defineProps<{ type?: number | null }>();

const meta = computed(() => {
  switch (props.type) {
    case 1:
      return { label: "机器人", cls: "robot" };
    case 2:
      return { label: "企业", cls: "enterprise" };
    default:
      return props.type ? { label: "特殊", cls: "other" } : null;
  }
});
</script>

<template>
  <span v-if="meta" class="user-type-tag" :class="meta.cls">{{
    meta.label
  }}</span>
</template>

<style scoped lang="less">
.user-type-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 16px;
  padding: 0 5px;
  margin-left: 6px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;

  &.robot {
    color: var(--brand-blue);
    background: rgba(64, 150, 255, 0.16);
  }

  &.enterprise {
    color: #d99512;
    background: rgba(250, 173, 20, 0.18);
  }

  &.other {
    color: var(--text-secondary);
    background: var(--surface-hover);
  }
}
</style>
