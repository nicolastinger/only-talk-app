<script setup lang="ts">
import PlazaUserGrid from './PlazaUserGrid.vue';
import { get_plaza_matches } from '@workspace/services';
import { useI18n } from '@/i18n';

const { t } = useI18n();
</script>

<template>
  <PlazaUserGrid
    :fetch="(page, size) => get_plaza_matches(page, size)"
    :empty-text="t('plaza.matchEmpty')"
    add-type="plaza_match"
  />
</template>
