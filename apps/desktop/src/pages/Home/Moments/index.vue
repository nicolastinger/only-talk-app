<script setup lang="ts">
import { ref } from 'vue';
import { PictureOutlined } from '@ant-design/icons-vue';
import NotificationBell from '@/components/NotificationBell/index.vue';
import NotificationPanel from '@/components/NotificationPanel/index.vue';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import MomentComposer from './components/MomentComposer.vue';
import MomentList from './components/MomentList.vue';
import styles from './index.module.less';

const { t } = useI18n();
const store = useBearStore();

const composerOpen = ref(false);
const refreshKey = ref(0);
const tab = ref('plaza');
const notifyVisible = ref(false);

const handlePublished = () => {
  refreshKey.value += 1;
};
</script>

<template>
  <div :class="styles.page">
    <div :class="styles.header">
      <div :class="styles.headerInfo">
        <div :class="styles.title">{{ t('moments.title') }}</div>
        <div :class="styles.subtitle">{{ t('moments.subtitle') }}</div>
      </div>
      <div :class="styles.headerActions">
        <NotificationBell
          :count="store.menuUnread.moments"
          @click="notifyVisible = true"
        />
        <button
          type="button"
          :class="styles.publishBtn"
          @click="composerOpen = true"
        >
          <PictureOutlined />
          <span>{{ t('moments.publish') }}</span>
        </button>
      </div>
    </div>
    <div :class="styles.tabs">
      <a-tabs v-model:active-key="tab">
        <a-tab-pane key="plaza" :tab="t('moments.tabs.plaza')" />
        <a-tab-pane key="following" :tab="t('moments.tabs.following')" />
        <a-tab-pane key="mine" :tab="t('moments.tabs.mine')" />
      </a-tabs>
    </div>
    <div :class="styles.body">
      <MomentList :key="tab" :refresh-key="refreshKey" :feed="tab" />
    </div>
    <MomentComposer
      :open="composerOpen"
      @close="composerOpen = false"
      @success="handlePublished"
    />
    <NotificationPanel
      :visible="notifyVisible"
      type="moments"
      @close="notifyVisible = false"
    />
  </div>
</template>
