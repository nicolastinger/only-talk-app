<script setup lang="ts">
import { useMessages } from "@/i18n";

defineProps<{
  title: string;
  updatedAt: string;
}>();

const { t } = useMessages();
</script>

<template>
  <div class="legal container">
    <h1 class="legal-title">{{ title }}</h1>
    <p class="legal-updated">{{ t.legal.updatedAt }}: {{ updatedAt }}</p>

    <div class="legal-notice">{{ t.legal.notice }}</div>

    <article class="legal-body">
      <slot />
    </article>
  </div>
</template>
