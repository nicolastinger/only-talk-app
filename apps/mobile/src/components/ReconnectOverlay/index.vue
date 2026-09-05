<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useQuicStore } from "@/stores/quic";

const { state } = useQuicStore();
const { isLoggedIn } = useAuthStore();
</script>

<template>
  <van-overlay
    :show="state.reconnectMaskVisible && isLoggedIn"
    :z-index="2600"
    lock-scroll
  >
    <div class="reconnect-mask">
      <div class="reconnect-card">
        <van-loading color="var(--color-primary)" size="30" />
        <p class="reconnect-title">网络连接已断开</p>
        <p class="reconnect-sub">正在重新连接，请稍候…</p>
      </div>
    </div>
  </van-overlay>
</template>

<style scoped lang="less">
.reconnect-mask {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 40px;
}

.reconnect-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 26px 34px;
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.reconnect-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.reconnect-sub {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
