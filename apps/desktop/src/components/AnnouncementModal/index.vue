<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  CloseOutlined,
  NotificationOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import MarkdownRenderer from '@/components/MarkdownRenderer/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useAnnouncementStore } from '@/stores/announcement';
import { useI18n } from '@/i18n';
import {
  get_announcement_read_users,
  getFiles,
  mark_announcement_read,
} from '@workspace/services';
import type {
  AnnouncementReadUserVO,
  AnnouncementVO,
} from '@workspace/types';
import styles from './index.module.less';

const props = defineProps<{
  visible: boolean;
  announcement: AnnouncementVO | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();
const announcementStore = useAnnouncementStore();

interface ReadUserWithAvatar extends AnnouncementReadUserVO {
  avatarUrl?: string;
}

const readUsers = ref<ReadUserWithAvatar[]>([]);
const loading = ref(false);

const loadReadUsers = async (uuid: string) => {
  loading.value = true;
  try {
    const res = await get_announcement_read_users(uuid, 1, 50);
    const list = res.list || [];
    readUsers.value = await Promise.all(
      list.map(async (u) => {
        let avatarUrl = '';
        if (u.icon) {
          try {
            const fileVos = await getFiles(u.icon);
            avatarUrl = fileVos?.[0]?.tauri_file_path || '';
          } catch {
            avatarUrl = '';
          }
        }
        return { ...u, avatarUrl };
      }),
    );
  } catch (e) {
    console.log('获取已读用户失败', e);
    readUsers.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.visible, props.announcement],
  () => {
    if (!props.visible || !props.announcement) return;
    readUsers.value = [];
    mark_announcement_read(props.announcement.uuid).catch(() => {});
    loadReadUsers(props.announcement.uuid);
  },
  { immediate: true },
);

const handleIgnore = () => {
  if (!props.announcement) return;
  announcementStore.ignore(props.announcement.uuid);
  emit('close');
};
</script>

<template>
  <a-modal
    :open="visible"
    :width="640"
    centered
    :footer="null"
    :closable="false"
    :class="styles.modal"
    @cancel="emit('close')"
  >
    <div v-if="announcement" :class="styles.wrap">
      <button type="button" :class="styles.closeBtn" @click="emit('close')">
        <CloseOutlined />
      </button>

      <div :class="styles.header">
        <div :class="styles.headerIcon"><NotificationOutlined /></div>
        <div :class="styles.headerMeta">
          <div :class="styles.headerTitle">{{ announcement.title }}</div>
          <div :class="styles.headerSub">
            <span>{{ t('announcement.readBy') }}</span>
            <span :class="styles.headerCount">{{ announcement.read_count }}</span>
          </div>
        </div>
      </div>

      <div :class="styles.body">
        <div :class="styles.contentCard">
          <MarkdownRenderer
            :content="announcement.content"
            :allow-html="announcement.content_type === 1"
            bare
          />
        </div>

        <div :class="styles.readSection">
          <div :class="styles.readHeader">
            <UserOutlined :class="styles.readIcon" />
            <span>{{ t('announcement.readBy') }}</span>
            <span :class="styles.readCount">{{ announcement.read_count }}</span>
          </div>

          <div v-if="loading" :class="styles.loading">
            <a-spin size="small" />
          </div>
          <a-empty
            v-else-if="readUsers.length === 0"
            :description="t('announcement.noReadUsers')"
          />
          <div v-else :class="styles.userList">
            <div
              v-for="u in readUsers"
              :key="u.uuid"
              :class="styles.userChip"
            >
              <a-avatar :size="28" :src="u.avatarUrl || DEFAULT_ICON">
                <template #icon><UserOutlined /></template>
              </a-avatar>
              <span :class="styles.chipName">
                {{ u.username || u.uuid }}
                <UserTypeTag :type="u.user_type" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div :class="styles.footer">
        <a-button type="text" :class="styles.ignoreBtn" @click="handleIgnore">
          {{ t('announcement.ignore') }}
        </a-button>
        <a-button
          type="primary"
          :class="styles.confirmBtn"
          @click="emit('close')"
        >
          {{ t('announcement.gotIt') }}
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
