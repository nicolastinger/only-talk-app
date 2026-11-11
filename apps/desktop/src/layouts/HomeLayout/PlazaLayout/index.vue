<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { SettingOutlined } from '@ant-design/icons-vue';
import NotificationBell from '@/components/NotificationBell/index.vue';
import NotificationPanel from '@/components/NotificationPanel/index.vue';
import CrushList from '@/pages/Home/Plaza/components/CrushList.vue';
import MatchList from '@/pages/Home/Plaza/components/MatchList.vue';
import PlazaList from '@/pages/Home/Plaza/components/PlazaList.vue';
import SwipeDeck from '@/pages/Home/Plaza/components/SwipeDeck.vue';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const router = useRouter();
const store = useBearStore();

const notifyVisible = ref(false);

const routeToSettings = () => {
  router.push('/home/settings?tab=plaza');
};
</script>

<template>
  <div :class="styles.page">
    <div :class="styles.header">
      <div :class="styles.headerInfo">
        <div :class="styles.title">{{ t('plaza.title') }}</div>
        <div :class="styles.subtitle">{{ t('plaza.subtitle') }}</div>
      </div>
      <div :class="styles.headerActions">
        <NotificationBell
          :count="store.menuUnread.plaza"
          @click="notifyVisible = true"
        />
        <button type="button" :class="styles.manageBtn" @click="routeToSettings">
          <SettingOutlined />
          <span>{{ t('plaza.manage') }}</span>
        </button>
      </div>
    </div>
    <div :class="styles.body">
      <a-tabs default-active-key="discover" :class="styles.tabs">
        <a-tab-pane key="discover" :tab="t('plaza.tabDiscover')">
          <PlazaList />
        </a-tab-pane>
        <a-tab-pane key="swipe" :tab="t('plaza.tabSwipe')">
          <SwipeDeck />
        </a-tab-pane>
        <a-tab-pane key="crush" :tab="t('plaza.tabCrush')">
          <CrushList />
        </a-tab-pane>
        <a-tab-pane key="match" :tab="t('plaza.tabMatch')">
          <MatchList />
        </a-tab-pane>
      </a-tabs>
    </div>
    <NotificationPanel
      :visible="notifyVisible"
      type="plaza"
      @close="notifyVisible = false"
    />
  </div>
</template>
