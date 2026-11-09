<script setup lang="ts">
import { computed } from 'vue';
import type { MenuProps } from 'ant-design-vue';
import { useI18n } from '@/i18n';
import styles from './LanguageButton.module.less';

const { locale, setLocale, t } = useI18n();

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

const items = computed<MenuProps['items']>(() => [
  { key: 'zh-CN', label: t('language.chinese') },
  { key: 'zh-TW', label: t('language.traditional') },
  { key: 'en-US', label: 'English' },
]);

const onMenuClick: MenuProps['onClick'] = ({ key }) => {
  setLocale(String(key) as 'zh-CN' | 'zh-TW' | 'en-US');
};
</script>

<template>
  <a-dropdown trigger="click">
    <template #overlay>
      <a-menu
        :items="items"
        :selected-keys="[locale]"
        @click="onMenuClick"
      />
    </template>
    <div :class="styles.languageButton">{{ langLabel }}</div>
  </a-dropdown>
</template>
