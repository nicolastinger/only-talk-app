<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import type { Locale } from '@workspace/i18n';
import styles from './LanguageButton.module.less';

const { locale, setLocale, t } = useI18n();

const LOCALES: Locale[] = ['zh-CN', 'zh-TW', 'en-US'];

const langLabel = computed(() => {
  switch (locale.value) {
    case 'zh-CN':
      return t('language.chinese');
    case 'zh-TW':
      return t('language.traditional');
    case 'en-US':
      return t('language.english');
    default:
      return t('language.chinese');
  }
});

const nextLocale = computed<Locale>(() => {
  const index = LOCALES.indexOf(locale.value);
  return LOCALES[(index + 1) % LOCALES.length];
});

const switchTip = computed(() => {
  switch (nextLocale.value) {
    case 'zh-CN':
      return t('language.switchToChinese');
    case 'zh-TW':
      return t('language.switchToTraditional');
    case 'en-US':
      return t('language.switchToEnglish');
    default:
      return t('language.switchToChinese');
  }
});

const cycleLanguage = () => {
  setLocale(nextLocale.value);
};
</script>

<template>
  <a-tooltip :title="switchTip" placement="bottom">
    <div :class="styles.languageButton" @click="cycleLanguage">
      {{ langLabel }}
    </div>
  </a-tooltip>
</template>
