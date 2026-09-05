<script setup lang="ts">
defineProps<{
  isMine: boolean;
}>();
</script>

<template>
  <div class="privacy-card" :class="{ mine: isMine }">
    <svg viewBox="0 0 24 24" fill="currentColor" class="privacy-icon">
      <path
        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 15.5l-3.54-3.54 1.41-1.41L11 13.67l5.13-5.13 1.41 1.41L11 16.5z"
      />
    </svg>
    <span>{{ isMine ? "我开启了隐私聊天" : "对方开启了隐私聊天" }}</span>
  </div>
</template>

<style scoped lang="less">
.privacy-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 12px;
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 13px;
  box-shadow: var(--shadow-xs);
}
.privacy-icon {
  width: 20px;
  height: 20px;
  color: var(--brand-blue);
  flex-shrink: 0;
}
</style>
