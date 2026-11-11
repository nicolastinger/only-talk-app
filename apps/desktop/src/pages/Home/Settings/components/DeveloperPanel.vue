<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  LOG_LEVEL_ERROR,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
} from '@workspace/types';
import type {
  AppLog,
  LogFileContent,
  LogFileInfo,
  LogPage,
  SyncBatchView,
  SyncTaskItem,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t } = useI18n();

/** 会话追平状态(与 src-tauri/entity/sync_task.rs 对齐) */
const STATUS_SUCCESS = 2;
const STATUS_FAILED = 3;

const formatTime = (ms: number): string => {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
};

const formatSize = (size: number): string => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(2)}MB`;
};

const levelMeta: Record<number, { text: string; color: string }> = {
  0: { text: 'DEBUG', color: 'default' },
  [LOG_LEVEL_INFO]: { text: 'INFO', color: 'blue' },
  [LOG_LEVEL_WARN]: { text: 'WARN', color: 'orange' },
  [LOG_LEVEL_ERROR]: { text: 'ERROR', color: 'red' },
};

const levelText = (level: number) => levelMeta[level]?.text ?? `L${level}`;
const levelColor = (level: number) => levelMeta[level]?.color ?? 'default';

const activeTab = ref('sync');

/* ---------------- 同步任务 ---------------- */

const batches = ref<SyncBatchView[]>([]);
const syncLoading = ref(false);
const activeKeys = ref<string[]>([]);

const loadSync = async () => {
  syncLoading.value = true;
  try {
    const result = await invoke<SyncBatchView[]>('get_sync_history');
    batches.value = result || [];
    if (batches.value.length > 0) {
      activeKeys.value = [String(batches.value[0]?.batch_id)];
    }
  } catch (error) {
    console.error('获取同步任务记录失败:', error);
    feedback.message.error(t('settings.developerPanel.loadFailed'));
  } finally {
    syncLoading.value = false;
  }
};

const statusTagColor = (task: SyncTaskItem) => {
  if (task.status === STATUS_SUCCESS) return 'success';
  if (task.status === STATUS_FAILED) return 'error';
  return undefined;
};

const statusTagText = (task: SyncTaskItem) => {
  if (task.status === STATUS_SUCCESS) {
    return t('settings.developerPanel.successStatus');
  }
  if (task.status === STATUS_FAILED) {
    return t('settings.developerPanel.failedStatus');
  }
  return String(task.status);
};

/* ---------------- 应用日志 ---------------- */

const logs = ref<AppLog[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const level = ref<number | undefined>(undefined);
const logLoading = ref(false);

const levelOptions = [
  { value: LOG_LEVEL_INFO, label: 'INFO' },
  { value: LOG_LEVEL_WARN, label: 'WARN' },
  { value: LOG_LEVEL_ERROR, label: 'ERROR' },
];

const loadLogs = async (p = page.value, lv = level.value) => {
  logLoading.value = true;
  try {
    const res = await invoke<LogPage>('get_app_logs', {
      level: lv ?? null,
      page: p,
      size: size.value,
    });
    logs.value = res.list;
    total.value = res.total;
  } catch (error) {
    console.error('获取日志失败:', error);
    feedback.message.error(t('settings.developerPanel.logLoadFailed'));
  } finally {
    logLoading.value = false;
  }
};

const onLevelChange = (value: number | undefined) => {
  level.value = value;
  page.value = 1;
  loadLogs(1, value);
};

const onClear = () => {
  feedback.modal.confirm({
    title: t('settings.developerPanel.logClear'),
    content: t('settings.developerPanel.logClearConfirm'),
    okText: t('settings.developerPanel.logClear'),
    okButtonProps: { danger: true },
    onOk: async () => {
      const n = await invoke<number>('clear_app_logs');
      feedback.message.success(
        t('settings.developerPanel.logClearSuccess', { count: n }),
      );
      page.value = 1;
      loadLogs(1, level.value);
    },
  });
};

const logColumns = computed(() => [
  {
    title: t('settings.developerPanel.logTime'),
    dataIndex: 'created_at',
    key: 'created_at',
    width: 170,
  },
  {
    title: t('settings.developerPanel.logLevel'),
    dataIndex: 'level',
    key: 'level',
    width: 90,
  },
  {
    title: t('settings.developerPanel.logSource'),
    dataIndex: 'source',
    key: 'source',
    width: 140,
  },
  {
    title: t('settings.developerPanel.logRemote'),
    dataIndex: 'remote_addr',
    key: 'remote_addr',
    width: 150,
  },
  {
    title: t('settings.developerPanel.logRaw'),
    dataIndex: 'raw',
    key: 'raw',
    ellipsis: true,
  },
  {
    title: t('settings.developerPanel.logDetail'),
    dataIndex: 'detail',
    key: 'detail',
    width: 180,
    ellipsis: true,
  },
]);

const logPagination = computed(() => ({
  current: page.value,
  pageSize: size.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: [20, 50, 100],
  showTotal: (value: number) =>
    t('settings.developerPanel.logTotal', { total: value }),
}));

const onTableChange = (pagination: { current?: number; pageSize?: number }) => {
  const p = pagination.current ?? page.value;
  const s = pagination.pageSize ?? size.value;
  page.value = p;
  size.value = s;
  loadLogs(p, level.value);
};

/* ---------------- 客户端日志 ---------------- */

const clientFiles = ref<LogFileInfo[]>([]);
const fileName = ref<string | undefined>(undefined);
const lines = ref<string[]>([]);
const totalLines = ref(0);
const clientLevel = ref<number | undefined>(undefined);
const keyword = ref('');
const clientLoading = ref(false);

const readFile = async (name: string) => {
  const data = await invoke<LogFileContent>('read_client_log_file', {
    fileName: name,
    maxLines: 500,
  });
  lines.value = data.lines;
  totalLines.value = data.total_lines;
};

const loadClientFiles = async () => {
  clientLoading.value = true;
  try {
    const list = (await invoke<LogFileInfo[]>('get_client_log_files')) || [];
    clientFiles.value = list;
    const target =
      fileName.value && list.some((f) => f.name === fileName.value)
        ? fileName.value
        : list[0]?.name;
    fileName.value = target;
    if (target) {
      await readFile(target);
    } else {
      lines.value = [];
      totalLines.value = 0;
    }
  } catch (error) {
    console.error('获取客户端日志文件失败:', error);
    feedback.message.error(t('settings.developerPanel.clientLogLoadFailed'));
  } finally {
    clientLoading.value = false;
  }
};

const onClientFileChange = async (name: string) => {
  fileName.value = name;
  await readFile(name);
};

const onClientLevelChange = (value: number | undefined) => {
  clientLevel.value = value;
};

const clientFileOptions = computed(() =>
  clientFiles.value.map((f) => ({
    value: f.name,
    label: `${f.name} (${formatSize(f.size)})`,
  })),
);

const filteredLines = computed(() =>
  lines.value.filter((line) => {
    if (
      clientLevel.value !== undefined &&
      !line.includes(`[${levelText(clientLevel.value)}]`)
    ) {
      return false;
    }
    const kw = keyword.value.trim().toLowerCase();
    if (kw && !line.toLowerCase().includes(kw)) return false;
    return true;
  }),
);

const loadedTabs = { log: false, clientLog: false };

onMounted(() => {
  loadSync();
});

watch(activeTab, (tab) => {
  if (tab === 'log' && !loadedTabs.log) {
    loadedTabs.log = true;
    loadLogs();
  }
  if (tab === 'clientLog' && !loadedTabs.clientLog) {
    loadedTabs.clientLog = true;
    loadClientFiles();
  }
});
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.developerPanel.title') }}
    </a-typography-title>
    <a-card :class="styles.settingCard">
      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="sync" :tab="t('settings.developerPanel.syncTab')">
          <div>
            <div :class="styles.syncToolbar">
              <a-button
                type="primary"
                size="small"
                :loading="syncLoading"
                @click="loadSync"
              >
                {{ t('settings.developerPanel.refresh') }}
              </a-button>
            </div>
            <a-spin :spinning="syncLoading">
              <a-empty
                v-if="batches.length === 0"
                :description="t('settings.developerPanel.empty')"
              />
              <a-collapse v-else v-model:active-key="activeKeys">
                <a-collapse-panel
                  v-for="batch in batches"
                  :key="String(batch.batch_id)"
                >
                  <template #header>
                    <span :class="styles.syncBatchLabel">
                      <a-typography-text>
                        {{ t('settings.developerPanel.batch') }}
                        {{ formatTime(batch.batch_id) }}
                      </a-typography-text>
                      <a-tag color="blue">
                        {{ t('settings.developerPanel.total') }}
                        {{ batch.total }}
                      </a-tag>
                      <a-tag color="green">
                        {{ t('settings.developerPanel.success') }}
                        {{ batch.success }}
                      </a-tag>
                      <a-tag v-if="batch.failed > 0" color="red">
                        {{ t('settings.developerPanel.failed') }}
                        {{ batch.failed }}
                      </a-tag>
                    </span>
                  </template>
                  <a-typography-text
                    v-if="batch.tasks.length === 0"
                    type="secondary"
                  >
                    {{ t('settings.developerPanel.noTask') }}
                  </a-typography-text>
                  <template v-else>
                    <div
                      v-for="task in batch.tasks"
                      :key="task.id"
                      :class="styles.syncTaskRow"
                    >
                      <div :class="styles.syncTaskMain">
                        <a-typography-text
                          :class="styles.syncTaskSession"
                          :ellipsis="{ tooltip: task.session_uuid }"
                        >
                          {{ task.session_uuid }}
                        </a-typography-text>
                        <a-tag :color="statusTagColor(task)">
                          {{ statusTagText(task) }}
                        </a-tag>
                      </div>
                      <div :class="styles.syncTaskMeta">
                        <a-typography-text type="secondary">
                          {{ t('settings.developerPanel.newCount') }}
                          {{ task.new_count }}
                        </a-typography-text>
                        <a-typography-text type="secondary">
                          {{ t('settings.developerPanel.batches') }}
                          {{ task.batches }}
                        </a-typography-text>
                        <a-typography-text
                          v-if="task.attempt > 1"
                          type="secondary"
                        >
                          {{ t('settings.developerPanel.attempt') }}
                          {{ task.attempt }}
                        </a-typography-text>
                      </div>
                      <div
                        v-if="task.status === STATUS_FAILED && task.last_error"
                        :class="styles.syncTaskError"
                      >
                        <a-typography-text
                          type="danger"
                          :ellipsis="{ tooltip: task.last_error }"
                        >
                          {{ task.last_error }}
                        </a-typography-text>
                      </div>
                    </div>
                  </template>
                </a-collapse-panel>
              </a-collapse>
            </a-spin>
          </div>
        </a-tab-pane>

        <a-tab-pane key="log" :tab="t('settings.developerPanel.logTab')">
          <div>
            <div :class="styles.syncToolbar">
              <a-space>
                <a-button
                  type="primary"
                  size="small"
                  :loading="logLoading"
                  @click="loadLogs(page, level)"
                >
                  {{ t('settings.developerPanel.refresh') }}
                </a-button>
                <a-select
                  size="small"
                  style="width: 120px"
                  :value="level"
                  :placeholder="t('settings.developerPanel.logLevelAll')"
                  allow-clear
                  :options="levelOptions"
                  @change="onLevelChange"
                />
                <a-button
                  size="small"
                  danger
                  :loading="logLoading"
                  @click="onClear"
                >
                  {{ t('settings.developerPanel.logClear') }}
                </a-button>
              </a-space>
            </div>
            <a-table
              row-key="id"
              size="small"
              :columns="logColumns"
              :data-source="logs"
              :loading="logLoading"
              :pagination="logPagination"
              :locale="{ emptyText: t('settings.developerPanel.logEmpty') }"
              @change="onTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'created_at'">
                  <a-typography-text type="secondary">
                    {{ formatTime(record.created_at) }}
                  </a-typography-text>
                </template>
                <template v-else-if="column.key === 'level'">
                  <a-tag :color="levelColor(record.level)">
                    {{ levelText(record.level) }}
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'source'">
                  <a-typography-text :class="styles.syncTaskSession">
                    {{ record.source || '-' }}
                  </a-typography-text>
                </template>
                <template v-else-if="column.key === 'remote_addr'">
                  <a-typography-text type="secondary">
                    {{ record.remote_addr || '-' }}
                  </a-typography-text>
                </template>
                <template v-else-if="column.key === 'raw'">
                  <a-typography-text :ellipsis="{ tooltip: record.raw }">
                    {{ record.raw }}
                  </a-typography-text>
                </template>
                <template v-else-if="column.key === 'detail'">
                  <a-typography-text
                    v-if="record.detail"
                    type="secondary"
                    :ellipsis="{ tooltip: record.detail }"
                  >
                    {{ record.detail }}
                  </a-typography-text>
                  <template v-else>-</template>
                </template>
              </template>
            </a-table>
          </div>
        </a-tab-pane>

        <a-tab-pane
          key="clientLog"
          :tab="t('settings.developerPanel.clientLogTab')"
        >
          <div>
            <div :class="styles.syncToolbar">
              <a-space>
                <a-button
                  type="primary"
                  size="small"
                  :loading="clientLoading"
                  @click="loadClientFiles"
                >
                  {{ t('settings.developerPanel.refresh') }}
                </a-button>
                <a-select
                  size="small"
                  style="width: 260px"
                  :value="fileName"
                  :placeholder="t('settings.developerPanel.clientLogSelect')"
                  :loading="clientLoading"
                  :options="clientFileOptions"
                  @change="onClientFileChange"
                />
                <a-select
                  size="small"
                  style="width: 120px"
                  :value="clientLevel"
                  :placeholder="t('settings.developerPanel.logLevelAll')"
                  allow-clear
                  :options="levelOptions"
                  @change="onClientLevelChange"
                />
                <a-input
                  v-model:value="keyword"
                  size="small"
                  style="width: 180px"
                  allow-clear
                  :placeholder="t('settings.developerPanel.clientLogKeyword')"
                />
              </a-space>
            </div>
            <a-empty
              v-if="lines.length === 0 && !clientLoading"
              :description="t('settings.developerPanel.logEmpty')"
            />
            <template v-else>
              <pre :class="styles.logConsole">{{
                filteredLines.join('\n')
              }}</pre>
              <a-typography-text type="secondary">
                {{
                  t('settings.developerPanel.clientLogLineCount', {
                    name: fileName ?? '-',
                    total: totalLines,
                    shown: filteredLines.length,
                  })
                }}
              </a-typography-text>
            </template>
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
