<script setup lang="ts">
import { useQuicStore } from "@/stores/quic";

const { state, reconnect } = useQuicStore();
</script>

<template>
  <div v-if="!state.isConnected" class="quic-bar">
    <span class="bar-icon" aria-hidden="true">⚠️</span>
    <span class="bar-text">{{
      state.message || "QUIC 连接已断开，请检查网络"
    }}</span>
    <button
      class="bar-btn"
      :class="{ loading: state.reconnecting }"
      :disabled="state.reconnecting"
      @click="reconnect"
    >
      <svg
        v-if="state.reconnecting"
        class="spin-icon"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path
          d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
        />
      </svg>
      <span>{{ state.reconnecting ? "连接中..." : "重新连接" }}</span>
    </button>
  </div>
</template>

<style scoped lang="less">
.quic-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top));
  background: var(--color-warning-bg);
  border-bottom: 1px solid rgba(250, 173, 20, 0.3);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-sm);
  animation: slideDown 0.25s ease;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.bar-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.bar-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-warning);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--color-warning), #f0a020);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition: all var(--transition-fast);

  &.loading {
    opacity: 0.8;
    cursor: default;
  }

  &:active {
    transform: scale(0.96);
  }
}

.spin-icon {
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
