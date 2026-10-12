<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="legal-section">
    <h2 class="legal-section-title">{{ title }}</h2>
    <div class="legal-section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="less">
.legal-section {
  margin-bottom: 28px;

  &:last-child {
    margin-bottom: 0;
  }
}

.legal-section-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
}

.legal-section-body {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.9;

  :deep(p) {
    margin: 0 0 12px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(a) {
    word-break: break-all;
  }
}
</style>
