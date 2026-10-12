<script setup lang="ts">
import LegalLayout from "@/layouts/LegalLayout.vue";
import LegalSection from "@/components/LegalSection.vue";
import { useMessages } from "@/i18n";

const { t } = useMessages();
</script>

<template>
  <LegalLayout :title="t.privacy.title" updated-at="2026-01-01">
    <LegalSection
      v-for="section in t.privacy.sections"
      :key="section.title"
      :title="section.title"
    >
      <p v-for="(para, index) in section.paras" :key="index">{{ para }}</p>
    </LegalSection>
  </LegalLayout>
</template>
