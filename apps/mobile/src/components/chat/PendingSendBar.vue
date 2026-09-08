<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "vant";
import type { ChatRecordSend } from "@workspace/types";

const props = defineProps<{
  friendUuid: string;
  /** 父页面自增信号，变化时重新拉取（发送新消息 / 201/202 ACK 后触发） */
  refreshSignal: number;
}>();

const pendingList = ref<ChatRecordSend[]>([]);
const actingId = ref("");
const collapsed = ref(false);
let actingTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;

/** 将 send 表 raw 解析为可展示的摘要文本 */
const formatRaw = (record: ChatRecordSend): string => {
  try {
    switch (record.text_type) {
      case 1: {
        const parsed = JSON.parse(record.raw);
        return parsed.text ?? record.raw;
      }
      case 2:
        return "[图片]";
      case 3: {
        // 移动端发送文件时 raw 是本地路径；落库后可能为 JSON
        try {
          const parsed = JSON.parse(record.raw);
          return parsed.file_name ?? "[文件]";
        } catch {
          const name = record.raw.split(/[/\\]/).pop();
          return name || "[文件]";
        }
      }
      default:
        return record.raw;
    }
  } catch {
    return record.raw;
  }
};

const sendingList = computed(() =>
  pendingList.value.filter((r) => r.send_status === 0 || r.send_status === 1)
);
const failedList = computed(() =>
  pendingList.value.filter((r) => r.send_status === 2)
);

// 可见性控制：避免对纯待发送列表过于敏感。
// 只有待发送（排队/发送中）记录时，需等重试次数超过 1 次才显示；
// 一旦出现明确失败记录则立即显示。
const shouldShow = computed(
  () =>
    failedList.value.length > 0 ||
    sendingList.value.some((r) => r.retry_count > 1)
);

/** 统一的操作入口：置位 actingId → 执行 → 解禁；异常/超时兜底保证界面不卡死 */
const runAction = async (sendId: string, action: () => Promise<void>) => {
  actingId.value = sendId;
  clearTimeout(actingTimer);
  // 兜底：15 秒后无论 invoke 是否返回都强制解禁（正常路径后端 10 秒锁超时会返回错误）
  actingTimer = setTimeout(() => {
    actingId.value = "";
  }, 15000);
  try {
    await action();
  } finally {
    clearTimeout(actingTimer);
    actingId.value = "";
  }
};

const fetchList = async (): Promise<ChatRecordSend[]> => {
  try {
    const list = (await invoke("get_pending_send_records", {
      recvUser: props.friendUuid,
    })) as ChatRecordSend[];
    pendingList.value = list;
    return list;
  } catch (e) {
    console.error("获取待发送记录失败:", e);
    return [];
  }
};

watch(
  () => props.refreshSignal,
  () => {
    fetchList();
  }
);

// 队列未清空时每 1s 轮询一次，直到记录全部消失（发送完成/忽略/清空）
watch(pendingList, (list) => {
  clearInterval(pollTimer);
  if (list.length > 0) {
    pollTimer = setInterval(() => {
      fetchList();
    }, 1000);
  }
});

const handleRetry = (sendId: string) =>
  runAction(sendId, async () => {
    try {
      await invoke("retry_send_msg", { sendId });
      const list = await fetchList();
      const stillFailed = list.some(
        (r) => r.send_id === sendId && r.send_status === 2
      );
      if (stillFailed) {
        showToast({ message: "重发失败", icon: "fail" });
      }
    } catch (e) {
      console.error("重发失败:", e);
      showToast({ message: "重发失败", icon: "fail" });
      await fetchList();
    }
  });

const handleIgnore = (sendId: string) =>
  runAction(sendId, async () => {
    try {
      await invoke("ignore_send_msg", { sendId });
      await fetchList();
    } catch (e) {
      console.error("忽略失败:", e);
      showToast({ message: "忽略失败", icon: "fail" });
    }
  });

onMounted(() => {
  fetchList();
});

onUnmounted(() => {
  clearInterval(pollTimer);
  clearTimeout(actingTimer);
});
</script>

<template>
  <div v-if="shouldShow" class="pending-bar">
    <!-- 折叠态：窄条 + 失败计数徽标，点击整条展开 -->
    <div v-if="collapsed" class="collapsed-bar" @click="collapsed = false">
      <span class="collapsed-info">
        <span class="collapsed-dot" />
        <span>待发送记录</span>
        <span v-if="failedList.length > 0" class="collapsed-badge">
          {{ failedList.length }}
        </span>
      </span>
      <svg class="collapse-arrow" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 8l6 6 1.4-1.4L12 5.2 4.6 12.6 6 14z" />
      </svg>
    </div>

    <!-- 展开态 -->
    <div v-else class="expanded-bar">
      <div class="pane-title bar-header" @click="collapsed = true">
        <span class="header-text">发送状态</span>
        <svg class="collapse-arrow down" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 16l-6-6-1.4 1.4L12 18.8l7.4-7.4L18 10z" />
        </svg>
      </div>

      <!-- 发送中 / 排队中 -->
      <div v-if="sendingList.length > 0" class="pane">
        <div class="pane-title">发送中</div>
        <div
          v-for="record in sendingList"
          :key="record.send_id"
          class="item sending-item"
        >
          <span v-if="record.send_status === 1" class="loading-spinner" />
          <span v-else class="queued-label">排队中</span>
          <span class="item-text" :title="formatRaw(record)">
            {{ formatRaw(record) }}
          </span>
        </div>
      </div>

      <!-- 发送失败 -->
      <div v-if="failedList.length > 0" class="pane pane-failed">
        <div class="pane-title">发送失败</div>
        <div
          v-for="record in failedList"
          :key="record.send_id"
          class="item failed-item"
          :class="{ acting: actingId === record.send_id }"
        >
          <span class="item-text" :title="formatRaw(record)">
            {{ formatRaw(record) }}
          </span>
          <button
            class="action-btn resend-btn"
            :disabled="actingId === record.send_id"
            @click="handleRetry(record.send_id)"
          >
            <span class="action-icon" :class="{ spin: actingId === record.send_id }">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"
                />
              </svg>
            </span>
          </button>
          <button
            class="action-btn ignore-btn"
            :disabled="actingId === record.send_id"
            @click="handleIgnore(record.send_id)"
          >
            <span class="action-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.pending-bar {
  flex-shrink: 0;
  margin: 8px 10px;
}

.collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  .collapsed-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-primary);
  }
  .collapsed-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-error);
    box-shadow: 0 0 6px rgba(255, 77, 79, 0.5);
  }
  .collapsed-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: var(--badge-bg, #ef4444);
    color: var(--badge-text, #fff);
    font-size: 11px;
    font-weight: 600;
  }
  .collapse-arrow {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
  }
}

.expanded-bar {
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  max-height: 40vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px 0;
}

.bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 6px 14px;
  .header-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .collapse-arrow {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
    &.down {
      transform: rotate(180deg);
    }
  }
}

.pane {
  padding: 4px 0 6px;
}
.pane-failed + .pane-failed {
  border-top: 0;
}
.pane-title {
  padding: 4px 14px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  &.acting {
    opacity: 0.7;
  }
  .item-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--text-primary);
  }
}

.sending-item {
  .queued-label {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-placeholder);
  }
  .item-text {
    color: var(--text-secondary);
  }
}

.failed-item {
  .item-text {
    color: var(--color-error);
  }
}

.loading-spinner {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 2px solid var(--border-medium);
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.action-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    background: var(--surface-hover);
  }
  .action-icon {
    width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    svg {
      width: 100%;
      height: 100%;
    }
    &.spin {
      animation: spin 0.8s linear infinite;
    }
  }
}

.resend-btn {
  color: var(--brand-blue);
}
.ignore-btn {
  color: var(--text-tertiary);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
