<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  CloseOutlined,
  DownOutlined,
  LoadingOutlined,
  UpOutlined,
} from '@ant-design/icons-vue';
import type { ChatRecordSend } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/PendingSendBar.module.less';

/** 默认/最小高度 */
const PENDING_BAR_HEIGHT = 48;
/** 拖拽可展开的最大高度 */
const PENDING_BAR_MAX_HEIGHT = 160;

const props = withDefaults(
  defineProps<{
    friendUuid: string;
    /** 父页面自增信号，变化时重新拉取（201 ACK / 发送新消息后触发） */
    refreshSignal: number;
    /** 绝对定位：距父容器底部偏移（即 footer 高度），使待发送条悬浮在 footer 顶部、不挤压布局 */
    bottom?: number;
  }>(),
  {
    bottom: 0,
  },
);

const emit = defineEmits<{
  (e: 'visible-change', visible: boolean): void;
}>();

const { t } = useI18n();
const pendingList = ref<ChatRecordSend[]>([]);
const actingId = ref('');
const height = ref(PENDING_BAR_HEIGHT);
const collapsed = ref(false);
const dragging = ref(false);
const dragStartRef = ref({ y: 0, h: PENDING_BAR_HEIGHT });
// 操作兜底计时器：invoke 异常挂起时强制解禁，避免按钮一直处于禁用状态
let actingTimer: number | undefined;
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
        return '[图片]';
      case 3: {
        const parsed = JSON.parse(record.raw);
        return parsed.file_name ?? '[文件]';
      }
      case 21:
        return '[语音]';
      default:
        return record.raw;
    }
  } catch {
    return record.raw;
  }
};

// 统一的操作入口：置位 actingId → 执行 → 解禁；异常/超时兜底保证界面不卡死
const runAction = async (sendId: string, action: () => Promise<void>) => {
  actingId.value = sendId;
  window.clearTimeout(actingTimer);
  // 兜底：15 秒后无论 invoke 是否返回都强制解禁（正常路径后端 10 秒锁超时会返回错误）
  actingTimer = window.setTimeout(() => {
    actingId.value = '';
  }, 15000);
  try {
    await action();
  } finally {
    window.clearTimeout(actingTimer);
    actingId.value = '';
  }
};

const fetchList = async (): Promise<ChatRecordSend[]> => {
  try {
    const list = await invoke<ChatRecordSend[]>('get_pending_send_records', {
      recvUser: props.friendUuid,
    });
    pendingList.value = list;
    return list;
  } catch (e) {
    console.log('获取待发送记录失败', e);
    return [];
  }
};

watch(
  () => [props.friendUuid, props.refreshSignal],
  () => {
    fetchList();
  },
  { immediate: true },
);

// 队列未清空时每 1s 轮询一次，直到记录全部消失（发送完成/忽略/清空）
watch(
  () => pendingList.value.length,
  (length) => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    if (length === 0) return;
    pollTimer = setInterval(() => {
      fetchList();
    }, 1000);
  },
  { immediate: true },
);

onUnmounted(() => {
  window.clearTimeout(actingTimer);
  if (pollTimer) clearInterval(pollTimer);
});

const sendingList = computed(() =>
  pendingList.value.filter((r) => r.send_status === 0 || r.send_status === 1),
);
const failedList = computed(() =>
  pendingList.value.filter((r) => r.send_status === 2),
);

// 可见性控制：避免对纯待发送列表过于敏感。
// 只有待发送（排队/发送中）记录时，需等重试次数超过 1 次才显示；
// 一旦出现明确失败记录则立即显示。
const shouldShow = computed(() => {
  const hasFailed = failedList.value.length > 0;
  const hasRetriedSending = sendingList.value.some((r) => r.retry_count > 1);
  return hasFailed || hasRetriedSending;
});

watch(
  shouldShow,
  (visible) => {
    emit('visible-change', visible);
  },
  { immediate: true },
);

// 绝对定位：悬浮在 footer 顶部，不参与文档流、不挤压布局
const positionStyle = computed(() => ({
  position: 'absolute' as const,
  bottom: props.bottom,
  left: 0,
  right: 0,
  zIndex: 3,
}));

// 顶部拖拽手柄：向上拖变高，向下拖变矮，window 级监听保证拖出组件也不断
const handleDragStart = (e: PointerEvent) => {
  e.preventDefault();
  dragging.value = true;
  dragStartRef.value = { y: e.clientY, h: height.value };
  const onMove = (ev: PointerEvent) => {
    const { y, h } = dragStartRef.value;
    const next = Math.max(
      PENDING_BAR_HEIGHT,
      Math.min(PENDING_BAR_MAX_HEIGHT, h + (y - ev.clientY)),
    );
    height.value = next;
  };
  const onUp = () => {
    dragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};

const handleRetry = (sendId: string) =>
  runAction(sendId, async () => {
    try {
      await invoke('retry_send_msg', { sendId });
      const list = await fetchList();
      // 重发后仍处于失败态：网络不通，发送再次失败
      const stillFailed = list.some(
        (r) => r.send_id === sendId && r.send_status === 2,
      );
      if (stillFailed) {
        feedback.message.warning(t('chat.pendingBar.resendFailed'));
      }
    } catch (e) {
      console.log(t('chat.pendingBar.resendFailed'), e);
      feedback.message.error(t('chat.pendingBar.resendFailed'));
      // 命令失败（如锁超时）也刷新一次，保证界面状态与后端一致
      await fetchList();
    }
  });

const handleIgnore = (sendId: string) =>
  runAction(sendId, async () => {
    try {
      await invoke('ignore_send_msg', { sendId });
      await fetchList();
    } catch (e) {
      console.log(t('chat.pendingBar.ignoreFailed'), e);
      feedback.message.error(t('chat.pendingBar.ignoreFailed'));
    }
  });

const handleCollapse = () => {
  collapsed.value = true;
};
</script>

<template>
  <template v-if="shouldShow">
    <div
      v-if="collapsed"
      :class="styles.collapsedBar"
      :style="positionStyle"
      :title="t('chat.pendingBar.expand')"
      @click="collapsed = false"
    >
      <span :class="styles.collapsedInfo">
        <span :class="styles.collapsedDot" />
        {{ t('chat.pendingBar.title') }}
        <span v-if="failedList.length > 0" :class="styles.collapsedBadge">
          {{ failedList.length }}
        </span>
      </span>
      <span :class="styles.collapsedExpand">
        <UpOutlined />
      </span>
    </div>
    <div
      v-else
      :class="[styles.pendingBar, dragging ? styles.dragging : '']"
      :style="{ ...positionStyle, height: `${height}px` }"
    >
      <div :class="styles.dragHandle" @pointerdown="handleDragStart" />
      <div :class="[styles.pane, styles.paneSending]">
        <div :class="styles.paneTitle">
          {{ t('chat.pendingBar.sending') }}
        </div>
        <div
          v-for="record in sendingList"
          :key="record.send_id"
          :class="[styles.item, styles.sendingItem]"
        >
          <LoadingOutlined v-if="record.send_status === 1" :class="styles.itemIcon" />
          <span v-else :class="styles.queuedLabel">
            {{ t('chat.pendingBar.queued') }}
          </span>
          <span :class="styles.itemText" :title="formatRaw(record)">
            {{ formatRaw(record) }}
          </span>
        </div>
      </div>
      <div :class="[styles.pane, styles.paneFailed]">
        <div :class="styles.paneTitle">
          {{ t('chat.pendingBar.failed') }}
        </div>
        <div
          v-for="record in failedList"
          :key="record.send_id"
          :class="[
            styles.item,
            styles.failedItem,
            actingId === record.send_id ? styles.actingItem : '',
          ]"
        >
          <span :class="styles.itemText" :title="formatRaw(record)">
            {{ formatRaw(record) }}
          </span>
          <button
            type="button"
            :class="[styles.actionBtn, styles.resendBtn]"
            :title="t('chat.pendingBar.resend')"
            :disabled="actingId === record.send_id"
            @click="handleRetry(record.send_id)"
          >
            <LoadingOutlined
              v-if="actingId === record.send_id"
              :class="styles.actionIcon"
            />
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="#8c8c8c"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              :class="styles.actionIcon"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            type="button"
            :class="[styles.actionBtn, styles.ignoreBtn]"
            :title="t('chat.pendingBar.ignore')"
            :disabled="actingId === record.send_id"
            @click="handleIgnore(record.send_id)"
          >
            <CloseOutlined :class="styles.actionIcon" />
          </button>
        </div>
      </div>
      <button
        type="button"
        :class="styles.collapseBtn"
        :title="t('chat.pendingBar.collapse')"
        @click="handleCollapse"
      >
        <DownOutlined :class="styles.collapseIcon" />
      </button>
    </div>
  </template>
</template>
