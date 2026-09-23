<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Collapse,
  CollapseItem,
  Empty,
  Loading,
  Tab,
  Tabs,
  Tag,
  showConfirmDialog,
  showToast,
} from "vant";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppLog,
  LogFileInfo,
  SyncBatchView,
  SyncTaskItem,
} from "@workspace/types";
import {
  LOG_LEVEL_ERROR,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
} from "@workspace/types";

const STATUS_SUCCESS = 2;
const STATUS_FAILED = 3;

const router = useRouter();
const goBack = () => router.back();

// ===================== 同步任务 =====================

const batches = ref<SyncBatchView[]>([]);
const loading = ref(false);
const activeBatch = ref<string[]>([]);

const formatTime = (ms: number) => {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
};

const statusText = (task: SyncTaskItem) =>
  task.status === STATUS_SUCCESS
    ? "成功"
    : task.status === STATUS_FAILED
    ? "失败"
    : `状态${task.status}`;

const load = async () => {
  loading.value = true;
  try {
    batches.value = (await invoke<SyncBatchView[]>("get_sync_history")) || [];
    if (batches.value.length > 0) {
      activeBatch.value = [String(batches.value[0].batch_id)];
    }
  } catch (error) {
    console.error("获取同步任务记录失败:", error);
    showToast({ message: "加载同步记录失败", icon: "fail" });
  } finally {
    loading.value = false;
  }
};

// ===================== 日志查看 =====================

const LOG_PAGE_SIZE = 30;
const logs = ref<AppLog[]>([]);
const logTotal = ref(0);
const logPage = ref(1);
const logLoading = ref(false);
const logHasMore = ref(true);
const logLevel = ref<number | undefined>(undefined);

const levelOptions = [
  { label: "全部", value: undefined },
  { label: "INFO", value: LOG_LEVEL_INFO },
  { label: "WARN", value: LOG_LEVEL_WARN },
  { label: "ERROR", value: LOG_LEVEL_ERROR },
];

const levelText = (l: number) =>
  l === 0
    ? "DEBUG"
    : l === 1
    ? "INFO"
    : l === 2
    ? "WARN"
    : l === 3
    ? "ERROR"
    : `L${l}`;

const levelClass = (l: number) =>
  l >= LOG_LEVEL_ERROR
    ? "level-error"
    : l === LOG_LEVEL_WARN
    ? "level-warn"
    : l === LOG_LEVEL_INFO
    ? "level-info"
    : "level-debug";

const resetLogs = () => {
  logs.value = [];
  logTotal.value = 0;
  logPage.value = 1;
  logHasMore.value = true;
};

const loadLogs = async (reset: boolean) => {
  if (logLoading.value) return;
  logLoading.value = true;
  try {
    const page = reset ? 1 : logPage.value;
    const data = await invoke<{ total: number; list: AppLog[] }>(
      "get_app_logs",
      {
        level: logLevel.value ?? null,
        page,
        size: LOG_PAGE_SIZE,
      }
    );
    logTotal.value = data.total;
    logs.value = reset ? data.list : [...logs.value, ...data.list];
    logPage.value = page + 1;
    logHasMore.value = logs.value.length < data.total;
  } catch (error) {
    console.error("获取日志失败:", error);
    showToast({ message: "获取日志失败", icon: "fail" });
  } finally {
    logLoading.value = false;
  }
};

const onLoadMore = () => loadLogs(false);

const onLevelChange = (v: number | undefined) => {
  logLevel.value = v;
  resetLogs();
  loadLogs(true);
};

const clearLogs = async () => {
  try {
    await showConfirmDialog({
      title: "清空日志",
      message: "确定清空全部 app_log 日志吗？此操作不可恢复。",
      confirmButtonColor: "#ee0a24",
    });
  } catch {
    return;
  }
  try {
    const n = await invoke<number>("clear_app_logs");
    resetLogs();
    showToast({ message: `已清空 ${n} 条日志`, icon: "success" });
  } catch (error) {
    console.error("清空日志失败:", error);
    showToast({ message: "清空日志失败", icon: "fail" });
  }
};

onMounted(() => {
  load();
  loadLogs(true);
  loadLogFiles();
});

// ===================== 客户端日志(fast_log 文件) =====================

const FILE_MAX_LINES = 500;
const logFiles = ref<LogFileInfo[]>([]);
const activeLogFile = ref("");
const fileLines = ref<string[]>([]);
const fileTotalLines = ref(0);
const keyword = ref("");
const fileLevel = ref<number | undefined>(undefined);
const fileLoading = ref(false);

const formatSize = (size: number) => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(2)}MB`;
};

const filteredFileLines = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const lv = fileLevel.value;
  return fileLines.value.filter((line) => {
    if (lv !== undefined && !line.includes(`[${levelText(lv)}]`)) return false;
    if (kw && !line.toLowerCase().includes(kw)) return false;
    return true;
  });
});

const loadLogFiles = async () => {
  fileLoading.value = true;
  try {
    logFiles.value =
      (await invoke<LogFileInfo[]>("get_client_log_files")) || [];
    if (logFiles.value.length === 0) {
      activeLogFile.value = "";
      fileLines.value = [];
      fileTotalLines.value = 0;
      return;
    }
    const target = activeLogFile.value || logFiles.value[0].name;
    await readClientLog(target);
  } catch (error) {
    console.error("获取客户端日志文件失败:", error);
    showToast({ message: "获取日志文件失败", icon: "fail" });
  } finally {
    fileLoading.value = false;
  }
};

const selectLogFile = async (name: string) => {
  if (activeLogFile.value === name) return;
  activeLogFile.value = name;
  await readClientLog(name);
};

const readClientLog = async (name: string) => {
  fileLoading.value = true;
  try {
    const data = await invoke<{
      name: string;
      total_lines: number;
      lines: string[];
    }>("read_client_log_file", { fileName: name, maxLines: FILE_MAX_LINES });
    activeLogFile.value = data.name;
    fileLines.value = data.lines;
    fileTotalLines.value = data.total_lines;
  } catch (error) {
    console.error("读取客户端日志失败:", error);
    showToast({ message: "读取日志文件失败", icon: "fail" });
  } finally {
    fileLoading.value = false;
  }
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="开发者" left-arrow @click-left="goBack" />

    <Tabs sticky class="dev-tabs">
      <!-- ============ 同步任务 ============ -->
      <Tab title="同步任务">
        <div class="toolbar">
          <button class="refresh-btn" :disabled="loading" @click="load">
            {{ loading ? "加载中" : "刷新" }}
          </button>
        </div>

        <Loading
          v-if="loading"
          class="list-state"
          color="#1989fa"
          size="24"
          vertical
        >
          加载中...
        </Loading>

        <Empty
          v-else-if="batches.length === 0"
          image="search"
          description="暂无同步记录"
        />

        <div v-else class="section-card">
          <Collapse v-model="activeBatch">
            <CollapseItem
              v-for="batch in batches"
              :key="batch.batch_id"
              :name="String(batch.batch_id)"
              :title="`批次 ${formatTime(batch.batch_id)}`"
            >
              <template #icon>
                <span
                  class="batch-dot"
                  :class="batch.failed > 0 ? 'dot-failed' : 'dot-ok'"
                ></span>
              </template>
              <template #value>
                <div class="batch-stats">
                  <span class="stat stat-total">共 {{ batch.total }}</span>
                  <span class="stat stat-ok">✓ {{ batch.success }}</span>
                  <span v-if="batch.failed > 0" class="stat stat-bad"
                    >✕ {{ batch.failed }}</span
                  >
                </div>
              </template>

              <div v-if="batch.tasks.length === 0" class="no-task">
                该批次无任务明细
              </div>
              <div v-else>
                <div
                  v-for="task in batch.tasks"
                  :key="task.id"
                  class="task-row"
                >
                  <div class="task-main">
                    <span class="task-session" :title="task.session_uuid">{{
                      task.session_uuid
                    }}</span>
                    <Tag
                      :type="
                        task.status === STATUS_SUCCESS
                          ? 'success'
                          : task.status === STATUS_FAILED
                          ? 'danger'
                          : 'default'
                      "
                      round
                    >
                      {{ statusText(task) }}
                    </Tag>
                  </div>
                  <div class="task-meta">
                    <span>新增 {{ task.new_count }}</span>
                    <span>批次数 {{ task.batches }}</span>
                    <span v-if="task.attempt > 1">尝试 {{ task.attempt }}</span>
                  </div>
                  <div
                    v-if="task.status === STATUS_FAILED && task.last_error"
                    class="task-error"
                  >
                    {{ task.last_error }}
                  </div>
                </div>
              </div>
            </CollapseItem>
          </Collapse>
        </div>
      </Tab>

      <!-- ============ 系统日志(app_log 表) ============ -->
      <Tab title="系统日志">
        <div class="toolbar log-toolbar">
          <button
            class="refresh-btn"
            :disabled="logLoading"
            @click="loadLogs(true)"
          >
            {{ logLoading ? "加载中" : "刷新" }}
          </button>
          <button class="clear-btn" :disabled="logLoading" @click="clearLogs">
            清空
          </button>
        </div>

        <div class="level-filter">
          <button
            v-for="opt in levelOptions"
            :key="opt.label"
            class="level-chip"
            :class="{ active: logLevel === opt.value }"
            @click="onLevelChange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <Empty
          v-if="!logLoading && logs.length === 0"
          image="search"
          description="暂无日志"
        />

        <div v-else class="log-list">
          <div v-for="log in logs" :key="log.id" class="log-row">
            <div class="log-head">
              <span class="log-level" :class="levelClass(log.level)">{{
                levelText(log.level)
              }}</span>
              <span class="log-source">{{ log.source }}</span>
              <span class="log-time">{{ formatTime(log.created_at) }}</span>
            </div>
            <div class="log-raw">{{ log.raw }}</div>
            <div v-if="log.remote_addr || log.detail" class="log-meta">
              <span v-if="log.remote_addr" class="log-remote"
                >@{{ log.remote_addr }}</span
              >
              <span v-if="log.detail" class="log-detail">{{ log.detail }}</span>
            </div>
          </div>

          <div v-if="logs.length > 0" class="log-footer">
            <span class="log-count">共 {{ logTotal }} 条</span>
            <button
              v-if="logHasMore"
              class="load-more-btn"
              :disabled="logLoading"
              @click="onLoadMore"
            >
              {{ logLoading ? "加载中..." : "加载更多" }}
            </button>
            <span v-else class="log-end">已全部加载</span>
          </div>
        </div>
      </Tab>

      <!-- ============ 客户端日志(fast_log 文件) ============ -->
      <Tab title="客户端日志">
        <div class="toolbar log-toolbar">
          <button
            class="refresh-btn"
            :disabled="fileLoading"
            @click="loadLogFiles"
          >
            {{ fileLoading ? "加载中" : "刷新" }}
          </button>
        </div>

        <div class="file-select">
          <button
            v-for="f in logFiles"
            :key="f.name"
            class="file-chip"
            :class="{ active: activeLogFile === f.name }"
            @click="selectLogFile(f.name)"
          >
            <span class="file-name">{{ f.name }}</span>
            <span class="file-size">{{ formatSize(f.size) }}</span>
          </button>
          <div v-if="logFiles.length === 0" class="no-file">暂无日志文件</div>
        </div>

        <div class="level-filter">
          <button
            v-for="opt in levelOptions"
            :key="opt.label"
            class="level-chip"
            :class="{ active: fileLevel === opt.value }"
            @click="fileLevel = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="log-search">
          <input
            v-model="keyword"
            type="text"
            placeholder="过滤关键字..."
            class="search-input"
          />
        </div>

        <div v-if="fileLines.length === 0 && !fileLoading" class="no-file">
          暂无内容
        </div>
        <div v-else class="log-console-wrap">
          <pre class="log-console">{{ filteredFileLines.join("\n") }}</pre>
          <div class="log-footer">
            <span class="log-count"
              >{{ activeLogFile }} · 共 {{ fileTotalLines }} 行，当前显示
              {{ filteredFileLines.length }} 行</span
            >
          </div>
        </div>
      </Tab>
    </Tabs>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.dev-tabs {
  :deep(.van-tabs__nav) {
    background: var(--surface);
  }

  :deep(.van-tab--active) {
    color: var(--color-primary);
  }
}

.toolbar {
  display: flex;
  gap: 10px;
  padding: 16px 16px 0;
}

.refresh-btn,
.clear-btn {
  height: 36px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:disabled {
    opacity: 0.6;
  }
}

.refresh-btn {
  background: var(--gradient-primary);
  color: var(--text-inverse);
}

.clear-btn {
  background: var(--surface);
  border: 1px solid rgba(238, 10, 36, 0.4);
  color: #ee0a24;
}

.list-state {
  padding: 40px 0;
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);

  :deep(.van-collapse-item__content) {
    padding: 4px 16px 12px;
    background: var(--surface);
  }
}

.batch-dot {
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.dot-ok {
    background: #07c160;
  }

  &.dot-failed {
    background: #ee0a24;
  }
}

.batch-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .stat-total {
    color: var(--text-tertiary);
  }

  .stat-ok {
    color: #07c160;
  }

  .stat-bad {
    color: #ee0a24;
  }
}

.no-task {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-placeholder);
}

.task-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.task-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-session {
  flex: 1;
  min-width: 0;
  font-family: monospace;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.task-error {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(238, 10, 36, 0.08);
  font-size: 12px;
  color: #ee0a24;
  word-break: break-all;
}

// ===================== 日志查看 =====================

.log-toolbar {
  padding-bottom: 8px;
}

.level-filter {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
  flex-wrap: wrap;
}

.level-chip {
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--surface);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }
}

.log-list {
  padding: 4px 16px 0;
}

.log-row {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
}

.log-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.log-level {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;

  &.level-debug {
    color: #909399;
    background: rgba(144, 147, 153, 0.12);
  }

  &.level-info {
    color: #1989fa;
    background: rgba(25, 137, 250, 0.12);
  }

  &.level-warn {
    color: #ff976a;
    background: rgba(255, 151, 106, 0.14);
  }

  &.level-error {
    color: #ee0a24;
    background: rgba(238, 10, 36, 0.12);
  }
}

.log-source {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.log-raw {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-all;
}

.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.log-remote {
  font-family: monospace;
}

.log-detail {
  word-break: break-all;
}

.log-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 0 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.load-more-btn {
  height: 32px;
  padding: 0 18px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: var(--surface);
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.log-end {
  color: var(--text-placeholder);
}

// ===================== 客户端日志 =====================

.file-select {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
  overflow-x: auto;
  flex-wrap: nowrap;

  &::-webkit-scrollbar {
    display: none;
  }
}

.file-chip {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  transition: all var(--transition-fast);

  .file-name {
    max-width: 160px;
    font-size: 12px;
    font-family: monospace;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &.active {
    border-color: var(--color-primary);
    background: rgba(25, 137, 250, 0.08);
  }
}

.no-file {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-placeholder);
}

.log-search {
  padding: 8px 16px 0;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 13px;
  color: var(--text-primary);
  outline: none;

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.log-console-wrap {
  padding: 4px 16px 0;
}

.log-console {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  margin: 0;
  border-radius: var(--radius-md);
  background: var(--surface-alt);
  border: 1px solid var(--border-light);
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
