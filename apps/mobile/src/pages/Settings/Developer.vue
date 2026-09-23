<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { invoke } from "@tauri-apps/api/core";
import type { SyncBatchView, SyncTaskItem } from "@workspace/types";

const STATUS_SUCCESS = 2;
const STATUS_FAILED = 3;

const router = useRouter();
const goBack = () => router.back();

const batches = ref<SyncBatchView[]>([]);
const loading = ref(false);
const activeBatch = ref<string[]>([]);

const formatTime = (ms: number) => {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
};

const statusText = (task: SyncTaskItem) =>
  task.status === STATUS_SUCCESS ? "成功" : task.status === STATUS_FAILED ? "失败" : `状态${task.status}`;

const statusClass = (task: SyncTaskItem) =>
  task.status === STATUS_SUCCESS ? "tag-success" : task.status === STATUS_FAILED ? "tag-failed" : "";

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

onMounted(load);
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="开发者" left-arrow @click-left="goBack" />

    <van-tabs sticky class="dev-tabs">
      <van-tab title="同步任务">
        <div class="toolbar">
          <button class="refresh-btn" :disabled="loading" @click="load">
            {{ loading ? "加载中" : "刷新" }}
          </button>
        </div>

        <van-loading v-if="loading" class="list-state" color="#1989fa" size="24" vertical>
          加载中...
        </van-loading>

        <div v-else-if="batches.length === 0" class="empty-box">暂无同步记录</div>

        <div v-else class="section-card">
          <van-collapse v-model="activeBatch">
            <van-collapse-item
              v-for="batch in batches"
              :key="batch.batch_id"
              :name="String(batch.batch_id)"
              :title="`批次 ${formatTime(batch.batch_id)}`"
            >
              <div class="batch-stats">
                <span class="stat">总数 {{ batch.total }}</span>
                <span class="stat stat-ok">成功 {{ batch.success }}</span>
                <span class="stat stat-bad">失败 {{ batch.failed }}</span>
              </div>

              <div v-if="batch.tasks.length === 0" class="no-task">该批次无任务明细</div>
              <div v-else>
                <div v-for="task in batch.tasks" :key="task.id" class="task-row">
                  <div class="task-main">
                    <span class="task-session" :title="task.session_uuid">{{ task.session_uuid }}</span>
                    <span class="task-status" :class="statusClass(task)">{{ statusText(task) }}</span>
                  </div>
                  <div class="task-meta">
                    <span>新增 {{ task.new_count }}</span>
                    <span>批次数 {{ task.batches }}</span>
                  </div>
                  <div v-if="task.status === STATUS_FAILED && task.last_error" class="task-error">
                    {{ task.last_error }}
                  </div>
                </div>
              </div>
            </van-collapse-item>
          </van-collapse>
        </div>
      </van-tab>
    </van-tabs>
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
  padding: 16px 16px 0;
}

.refresh-btn {
  height: 36px;
  padding: 0 20px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:disabled {
    opacity: 0.6;
  }
}

.list-state {
  padding: 40px 0;
}

.empty-box {
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-placeholder);
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.batch-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-secondary);

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

.task-status {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;

  &.tag-success {
    color: #07c160;
    background: rgba(7, 193, 96, 0.12);
  }

  &.tag-failed {
    color: #ee0a24;
    background: rgba(238, 10, 36, 0.12);
  }
}

.task-meta {
  display: flex;
  gap: 16px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.task-error {
  margin-top: 4px;
  font-size: 12px;
  color: #ee0a24;
  word-break: break-all;
}
</style>