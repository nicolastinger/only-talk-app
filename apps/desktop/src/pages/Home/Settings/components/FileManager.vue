<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  AudioOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import type { FileType, LocalFileVo } from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t } = useI18n();

const typeOptions = computed(() => [
  { value: '', label: t('settings.fileManager.all') },
  { value: 'image', label: t('settings.fileManager.image') },
  { value: 'video', label: t('settings.fileManager.video') },
  { value: 'audio', label: t('settings.fileManager.audio') },
  { value: 'document', label: t('settings.fileManager.document') },
  { value: 'archive', label: t('settings.fileManager.archive') },
  { value: 'other', label: t('settings.fileManager.other') },
]);

const typeColor: Record<string, string> = {
  image: 'geekblue',
  video: 'purple',
  audio: 'cyan',
  document: 'green',
  archive: 'orange',
  other: 'default',
};

const formatSize = (size: number): string => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)}MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
};

const formatTime = (ms: number): string => {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
};

const typeColorMap = (type: string): string => {
  switch (type) {
    case 'video':
      return '#722ed1';
    case 'audio':
      return '#13c2c2';
    case 'document':
      return '#52c41a';
    case 'archive':
      return '#fa8c16';
    default:
      return '#8c8c8c';
  }
};

const files = ref<LocalFileVo[]>([]);
const loading = ref(false);
const fileType = ref('');
const sortBy = ref<'date' | 'name'>('date');
const sortOrder = ref<'desc' | 'asc'>('desc');

const load = async (
  type = fileType.value,
  by = sortBy.value,
  order = sortOrder.value,
) => {
  loading.value = true;
  try {
    const result = await invoke<LocalFileVo[]>('get_local_file_list', {
      fileType: type || null,
      sortBy: by,
      sortOrder: order,
    });
    files.value = result || [];
  } catch (error) {
    console.error('获取文件列表失败:', error);
    feedback.message.error(t('settings.fileManager.loadFailed'));
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  load();
});

const onTypeChange = (v: string) => {
  fileType.value = v;
  load(v, sortBy.value, sortOrder.value);
};

const onSortChange = (by: 'date' | 'name', order: 'desc' | 'asc') => {
  sortBy.value = by;
  sortOrder.value = order;
  load(fileType.value, by, order);
};

const onSortByChange = (value: 'date' | 'name') => {
  onSortChange(value, sortOrder.value);
};

const onSortOrderChange = (value: 'desc' | 'asc') => {
  onSortChange(sortBy.value, value);
};

const onDelete = async (file: LocalFileVo) => {
  try {
    await invoke('delete_local_file', { id: file.id });
    feedback.message.success(t('settings.fileManager.deleteSuccess'));
    load();
  } catch (error) {
    console.error('删除文件失败:', error);
    feedback.message.error(t('settings.fileManager.deleteFailed'));
  }
};

const columns = computed(() => [
  {
    title: t('settings.fileManager.name'),
    dataIndex: 'file_name',
    key: 'file_name',
    ellipsis: true,
  },
  {
    title: t('settings.fileManager.type'),
    dataIndex: 'file_type',
    key: 'file_type',
    width: 100,
  },
  {
    title: t('settings.fileManager.size'),
    dataIndex: 'file_size',
    key: 'file_size',
    width: 100,
  },
  {
    title: t('settings.fileManager.createdAt'),
    dataIndex: 'created_at',
    key: 'created_at',
    width: 170,
  },
  {
    title: t('settings.fileManager.action'),
    key: 'action',
    width: 80,
  },
]);

const paginationConfig = computed(() => ({
  pageSize: 20,
  showSizeChanger: true,
  pageSizeOptions: [20, 50, 100],
  showTotal: (value: number) =>
    t('settings.fileManager.total', { total: value }),
}));

const typeLabel = (value: FileType) => t(`settings.fileManager.${value}`);
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.fileManager.title') }}
    </a-typography-title>
    <div :class="styles.syncToolbar">
      <a-space wrap>
        <a-button
          type="primary"
          size="small"
          :loading="loading"
          @click="load()"
        >
          {{ t('settings.fileManager.refresh') }}
        </a-button>
        <a-select
          size="small"
          style="width: 120px"
          :value="fileType"
          :options="typeOptions"
          @change="onTypeChange"
        />
        <a-select
          size="small"
          style="width: 120px"
          :value="sortBy"
          :options="[
            { value: 'date', label: t('settings.fileManager.sortByDate') },
            { value: 'name', label: t('settings.fileManager.sortByName') },
          ]"
          @change="onSortByChange"
        />
        <a-select
          size="small"
          style="width: 110px"
          :value="sortOrder"
          :options="[
            { value: 'desc', label: t('settings.fileManager.desc') },
            { value: 'asc', label: t('settings.fileManager.asc') },
          ]"
          @change="onSortOrderChange"
        />
      </a-space>
    </div>
    <a-table
      row-key="id"
      size="small"
      :columns="columns"
      :data-source="files"
      :loading="loading"
      :pagination="paginationConfig"
      :locale="{ emptyText: t('settings.fileManager.empty') }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'file_name'">
          <a-space :size="10">
            <img
              v-if="record.file_type === 'image'"
              :src="convertFileSrc(record.file_path)"
              :alt="record.file_name"
              :style="{
                width: '40px',
                height: '40px',
                borderRadius: '6px',
                objectFit: 'cover',
                flexShrink: 0,
                background: 'var(--color-gray-3)',
              }"
            />
            <div
              v-else
              :style="{
                width: '40px',
                height: '40px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: typeColorMap(record.file_type),
                background: 'var(--color-gray-3)',
                flexShrink: 0,
              }"
            >
              <VideoCameraOutlined v-if="record.file_type === 'video'" />
              <AudioOutlined v-else-if="record.file_type === 'audio'" />
              <FileTextOutlined v-else-if="record.file_type === 'document'" />
              <FileZipOutlined v-else-if="record.file_type === 'archive'" />
              <FileImageOutlined v-else-if="record.file_type === 'image'" />
              <FolderOutlined v-else />
            </div>
            <a-typography-text
              style="color: var(--text-primary)"
              :ellipsis="{ tooltip: record.file_name }"
            >
              {{ record.file_name }}
            </a-typography-text>
          </a-space>
        </template>
        <template v-else-if="column.key === 'file_type'">
          <a-tag :color="typeColor[record.file_type]">
            {{ typeLabel(record.file_type) }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'file_size'">
          <a-typography-text type="secondary">
            {{ formatSize(record.file_size) }}
          </a-typography-text>
        </template>
        <template v-else-if="column.key === 'created_at'">
          <a-typography-text type="secondary">
            {{ formatTime(record.created_at) }}
          </a-typography-text>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-popconfirm
            :title="t('settings.fileManager.deleteConfirm')"
            :ok-text="t('settings.fileManager.delete')"
            :cancel-text="t('settings.fileManager.cancel')"
            :ok-button-props="{ danger: true }"
            @confirm="onDelete(record)"
          >
            <a-button size="small" danger>
              {{ t('settings.fileManager.delete') }}
            </a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>
  </div>
</template>
