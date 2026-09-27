<script setup lang="ts">
import { useQuicStore } from "@/stores/quic";

const { state } = useQuicStore();
</script>

<template>
  <div v-if="state.statusTag" class="conn-tag" :class="`conn-tag--${state.statusTag}`">
    <span v-if="state.statusTag === 'reconnecting'" class="conn-tag__spinner" />
    <span>{{ state.statusTag === 'offline' ? '已离线' : state.statusTag === 'reconnecting' ? '重连中' : '已上线' }}</span>
  </div>
</template>

<style scoped lang="less">
.conn-tag {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 8px);
  left: 12px;
  z-index: 2200;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
  animation: connTagIn 0.25s ease;

  &--offline {
    background: var(--color-error);
  }

  &--reconnecting {
    background: var(--color-warning);
  }

  &--online {
    background: var(--color-success);
  }

  &__spinner {
    width: 10px;
    height: 10px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: connTagSpin 0.8s linear infinite;
  }
}

@keyframes connTagSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes connTagIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>