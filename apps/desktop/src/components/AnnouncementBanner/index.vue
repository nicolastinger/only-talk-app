<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AnnouncementModal from '@/components/AnnouncementModal/index.vue';
import { useAnnouncementStore } from '@/stores/announcement';
import { formatMessageTime } from '@/utils/format';
import { useI18n } from '@/i18n';
import { get_announcement_list } from '@workspace/services';
import type { AnnouncementVO } from '@workspace/types';
import styles from './index.module.less';

const { t } = useI18n();
const announcementStore = useAnnouncementStore();

const list = ref<AnnouncementVO[]>([]);
const loading = ref(true);
const failed = ref(false);
const open = ref(false);
const active = ref<AnnouncementVO | null>(null);
const modalVisible = ref(false);

const fetchList = async (silent = false) => {
  if (!silent) loading.value = true;
  try {
    const res = await get_announcement_list(1, 20);
    list.value = res.list || [];
    failed.value = false;
  } catch (e) {
    console.log('获取公告列表失败', e);
    failed.value = true;
  } finally {
    if (!silent) loading.value = false;
  }
};

onMounted(() => {
  fetchList().catch(() => {});
});

const visibleList = computed(() =>
  list.value.filter(
    (item) =>
      (item.title || item.content) &&
      !announcementStore.ignored.includes(item.uuid),
  ),
);

const unreadCount = computed(
  () => visibleList.value.filter((item) => !item.is_read).length,
);

const openDetail = (item: AnnouncementVO) => {
  list.value = list.value.map((it) =>
    it.uuid === item.uuid ? { ...it, is_read: true } : it,
  );
  active.value = { ...item, is_read: true };
  open.value = false;
  modalVisible.value = true;
};

watch(open, (next) => {
  if (next) fetchList(true).catch(() => {});
});

const title = computed(() => t('announcement.banner'));
const panelTitle = computed(() => t('chats.announcements'));
const badgeText = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)));
</script>

<template>
  <div :class="styles.banner">
    <a-tooltip :title="title" placement="bottom">
      <a-popover
        v-model:open="open"
        trigger="click"
        placement="bottomRight"
        :arrow="false"
        :overlay-class-name="styles.popover"
      >
        <template #content>
          <div :class="styles.panel">
            <div :class="styles.panelHeader">
              <span :class="styles.panelTitle">
                <svg
                  :class="styles.headerIcon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
                  />
                </svg>
                {{ panelTitle }}
              </span>
              <span v-if="unreadCount > 0" :class="styles.unreadTag">
                {{ unreadCount }} {{ t('notification.unreadCount') }}
              </span>
            </div>

            <div v-if="loading" :class="styles.center">
              <a-spin size="small" />
            </div>
            <div v-else-if="failed && visibleList.length === 0" :class="styles.empty">
              <button
                type="button"
                :class="styles.retry"
                @click="fetchList().catch(() => {})"
              >
                {{ t('announcement.loadFailed') }}
              </button>
            </div>
            <div v-else-if="visibleList.length === 0" :class="styles.empty">
              {{ t('announcement.empty') }}
            </div>
            <div v-else :class="styles.list">
              <div
                v-for="item in visibleList"
                :key="item.uuid"
                :class="[styles.item, item.is_read ? styles.read : '']"
                @click="openDetail(item)"
              >
                <span
                  :class="[styles.dot, item.is_read ? '' : styles.dotUnread]"
                />
                <div :class="styles.itemMain">
                  <div :class="styles.itemTitle">
                    {{ item.title || panelTitle }}
                  </div>
                  <div :class="styles.itemTime">
                    {{ formatMessageTime(item.created_at * 1000) }}
                  </div>
                </div>
                <svg
                  :class="styles.arrow"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                </svg>
              </div>
            </div>

            <div v-if="announcementStore.ignored.length > 0" :class="styles.ignoredBar">
              <span>
                {{ t('announcement.ignored') }}
                {{ announcementStore.ignored.length }}
              </span>
              <button
                type="button"
                :class="styles.linkBtn"
                @click="announcementStore.restoreAll()"
              >
                {{ t('announcement.restoreAll') }}
              </button>
            </div>
            <div :class="styles.footer">
              <button
                type="button"
                :class="styles.confirmBtn"
                @click="open = false"
              >
                {{ t('announcement.gotIt') }}
              </button>
            </div>
          </div>
        </template>

        <div
          :class="styles.trigger"
          role="button"
          tabindex="0"
          :aria-label="title"
          @keydown="
            (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open = !open;
              }
            }
          "
        >
          <svg
            :class="styles.icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
          <span v-if="unreadCount > 0" :class="styles.badge">
            {{ badgeText }}
          </span>
        </div>
      </a-popover>
    </a-tooltip>
  </div>

  <AnnouncementModal
    :visible="modalVisible"
    :announcement="active"
    @close="modalVisible = false"
  />
</template>
