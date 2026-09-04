<script setup lang="ts">
import { useQuicStore } from "@/stores/quic";

const { state } = useQuicStore();
</script>

<template>
  <van-overlay :show="state.isSyncing" :z-index="3000">
    <div class="sync-mask">
      <div class="sync-card">
        <van-loading color="var(--color-primary)" size="30">
          <span class="sync-text">正在同步离线消息...</span>
        </van-loading>
      </div>
    </div>
  </van-overlay>
</template>

<style scoped lang="less">
.sync-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sync-card {
  display: flex;
  align-items: center;
  padding: 22px 28px;
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.sync-text {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
