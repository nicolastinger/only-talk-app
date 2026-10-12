<script setup lang="ts">
import LegalLayout from "@/layouts/LegalLayout.vue";
import LegalSection from "@/components/LegalSection.vue";
import { useMessages } from "@/i18n";
import { linkify } from "@/utils/linkify";

const { t } = useMessages();
</script>

<template>
  <LegalLayout :title="t.agreement.title" updated-at="2026-01-01">
    <LegalSection
      v-for="section in t.agreement.sections"
      :key="section.title"
      :title="section.title"
    >
      <p v-for="(para, index) in section.paras" :key="index">
        <template v-for="(seg, segIndex) in linkify(para)" :key="segIndex">
          <a
            v-if="seg.href"
            :href="seg.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ seg.text }}
          </a>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
    </LegalSection>
  </LegalLayout>
</template>
