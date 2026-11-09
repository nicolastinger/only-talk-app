<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  BellOutlined,
  CodeOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { useI18n } from '@/i18n';
import styles from './Settings.module.less';
import AboutApp from './components/AboutApp.vue';
import AccountPrivacy from './components/AccountPrivacy.vue';
import AuthFactor from './components/AuthFactor.vue';
import BlackList from './components/BlackList.vue';
import DeveloperPanel from './components/DeveloperPanel.vue';
import FileManager from './components/FileManager.vue';
import GeneralSettings from './components/GeneralSettings.vue';
import NotificationSettings from './components/NotificationSettings.vue';
import PlazaSettings from './components/PlazaSettings.vue';

const { t } = useI18n();
const route = useRoute();

const queryTab = computed(() =>
  typeof route.query.tab === 'string' ? route.query.tab : '',
);

const activeTab = ref(queryTab.value || 'account');

watch(queryTab, (value) => {
  if (value) {
    activeTab.value = value;
  }
});

interface MenuItem {
  key: string;
  icon: Component;
  label: string;
}

const menuItems = computed<MenuItem[]>(() => [
  { key: 'account', icon: UserOutlined, label: t('settings.account') },
  {
    key: 'authFactor',
    icon: SafetyCertificateOutlined,
    label: t('settings.authFactor.menu'),
  },
  { key: 'general', icon: SettingOutlined, label: t('settings.general') },
  {
    key: 'notification',
    icon: BellOutlined,
    label: t('settings.notification'),
  },
  { key: 'plaza', icon: RadarChartOutlined, label: t('settings.plaza') },
  {
    key: 'blacklist',
    icon: StopOutlined,
    label: t('settings.blacklistMenu'),
  },
  {
    key: 'files',
    icon: FolderOutlined,
    label: t('settings.fileManager.menu'),
  },
  { key: 'about', icon: InfoCircleOutlined, label: t('settings.about') },
  { key: 'developer', icon: CodeOutlined, label: t('settings.developer') },
]);

const componentMap: Record<string, Component> = {
  account: AccountPrivacy,
  authFactor: AuthFactor,
  general: GeneralSettings,
  notification: NotificationSettings,
  plaza: PlazaSettings,
  blacklist: BlackList,
  files: FileManager,
  about: AboutApp,
  developer: DeveloperPanel,
};

const currentComponent = computed(
  () => componentMap[activeTab.value] ?? AccountPrivacy,
);

const onMenuClick = ({ key }: { key: string | number }) => {
  activeTab.value = String(key);
};
</script>

<template>
  <a-layout :class="styles.settingsContainer">
    <a-layout-sider
      :width="250"
      :class="styles.settingsSidebar"
      :style="{ background: 'var(--glass-bg-light)' }"
    >
      <div :class="styles.sidebarTitle">{{ t('settings.title') }}</div>
      <a-menu
        mode="inline"
        :selected-keys="[activeTab]"
        :class="styles.menu"
        @click="onMenuClick"
      >
        <a-menu-item v-for="item in menuItems" :key="item.key">
          <template #icon>
            <component :is="item.icon" />
          </template>
          {{ item.label }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout-content :class="styles.settingsContent">
      <component :is="currentComponent" />
    </a-layout-content>
  </a-layout>
</template>
