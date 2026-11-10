<script setup lang="ts">
/**
 * 聊天记录（移动端独立页面）。
 *
 * 入口：单聊/群聊页头部的「聊天记录」按钮。
 * 支持日期、对象（发送者）、类型、关键词筛选；数据来自本地库（search_chat_record）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import {
  DEFAULT_CHAT_HISTORY_PAGE_SIZE,
  get_group_members,
  get_user_info_with_cache,
  resolveMessagePreview,
  searchChatRecord,
} from '@workspace/services';
import type { TextQuicMsgVo } from '@workspace/types';
import { useUserStore } from '@/stores/user';
import { t } from '@/i18n';

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
type TypeKey = 'all' | 'text' | 'image' | 'file' | 'voice';

const route = useRoute();
const router = useRouter();
const { userInfo, loadUserInfo } = useUserStore();

const isGroup = computed(() => route.query.isGroup === '1');
const conversationId = computed(() =>
  String((isGroup.value ? route.query.groupId : route.query.friendId) || '')
);
const conversationTitle = computed(() =>
  String(route.query.title || t('chatHistory.title'))
);
const meUuid = computed(() => userInfo.value?.uuid || '');

const datePreset = ref<DatePreset>('all');
const customStart = ref('');
const customEnd = ref('');
const objectFilter = ref('');
const typeKey = ref<TypeKey>('all');
const keyword = ref('');

const items = ref<TextQuicMsgVo[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
const page = ref(1);

const groupMemberNames = ref<Record<string, string>>({});
const groupMemberIds = ref<string[]>([]);

const TYPE_GROUPS: Record<Exclude<TypeKey, 'all'>, number[]> = {
  text: [1, 2001],
  image: [2, 2002],
  file: [3, 2003],
  voice: [21, 2006],
};

const dateOptions: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'chatHistory.dateAll' },
  { value: 'today', label: 'chatHistory.today' },
  { value: '7d', label: 'chatHistory.last7Days' },
  { value: '30d', label: 'chatHistory.last30Days' },
  { value: 'custom', label: 'chatHistory.custom' },
];

const typeOptions: { value: TypeKey; label: string }[] = [
  { value: 'all', label: 'chatHistory.all' },
  { value: 'text', label: 'chatHistory.typeText' },
  { value: 'image', label: 'chatHistory.typeImage' },
  { value: 'file', label: 'chatHistory.typeFile' },
  { value: 'voice', label: 'chatHistory.typeVoice' },
];

const objectOptions = computed(() => {
  const options = [{ value: '', label: t('chatHistory.objectAll') }];
  if (meUuid.value) {
    options.push({ value: meUuid.value, label: t('chatHistory.me') });
  }
  if (isGroup.value) {
    for (const uuid of groupMemberIds.value) {
      if (uuid === meUuid.value) continue;
      options.push({
        value: uuid,
        label: groupMemberNames.value[uuid] || uuid,
      });
    }
  } else if (conversationId.value && conversationId.value !== meUuid.value) {
    options.push({
      value: conversationId.value,
      label: conversationTitle.value,
    });
  }
  return options;
});

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const rangeStart = computed(() => {
  const now = new Date();
  switch (datePreset.value) {
    case 'today':
      return startOfDay(now);
    case '7d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return startOfDay(from);
    }
    case '30d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return startOfDay(from);
    }
    case 'custom':
      return customStart.value
        ? new Date(`${customStart.value}T00:00:00`).getTime()
        : undefined;
    default:
      return undefined;
  }
});

const rangeEnd = computed(() => {
  if (datePreset.value === 'all') return undefined;
  if (datePreset.value === 'custom') {
    return customEnd.value
      ? new Date(`${customEnd.value}T23:59:59.999`).getTime()
      : undefined;
  }
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).getTime();
});

const selectedTypes = computed<number[] | undefined>(() => {
  if (typeKey.value === 'all') return undefined;
  return TYPE_GROUPS[typeKey.value];
});

const pad = (value: number): string => String(value).padStart(2, '0');

const dateLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
};

const timeLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const kindLabel = (kind: string): string => {
  switch (kind) {
    case 'image':
      return t('chatHistory.typeImage');
    case 'file':
      return t('chatHistory.typeFile');
    case 'voice':
      return t('chatHistory.typeVoice');
    case 'text':
      return t('chatHistory.typeText');
    default:
      return t('chatHistory.typeOther');
  }
};

const senderName = (uuid: string): string => {
  if (!uuid) return t('chatHistory.unknownUser');
  if (uuid === meUuid.value) return t('chatHistory.me');
  if (!isGroup.value) {
    return uuid === conversationId.value ? conversationTitle.value : uuid;
  }
  return groupMemberNames.value[uuid] || uuid;
};

const displayItems = computed(() =>
  items.value.map((msg) => {
    const preview = resolveMessagePreview(msg.text_type, msg.raw, t);
    return {
      ...msg,
      preview: preview.text,
      kind: preview.kind,
    };
  })
);

const dateGroups = computed(() => {
  const groups: { date: string; items: typeof displayItems.value }[] = [];
  for (const item of displayItems.value) {
    const date = dateLabel(item.timestamp);
    let group = groups[groups.length - 1];
    if (!group || group.date !== date) {
      group = { date, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
});

const loadMembers = async () => {
  if (!isGroup.value || !conversationId.value) return;
  try {
    const list = (await get_group_members(conversationId.value)) || [];
    groupMemberIds.value = list.map((m) => m.user_uuid).filter(Boolean);
    const names: Record<string, string> = {};
    await Promise.all(
      list.map(async (member) => {
        try {
          const result = await get_user_info_with_cache(member.user_uuid);
          names[member.user_uuid] =
            member.nickname || result.user_info.username || member.user_uuid;
        } catch {
          names[member.user_uuid] = member.nickname || member.user_uuid;
        }
      })
    );
    groupMemberNames.value = names;
  } catch (e) {
    console.error('加载群成员失败:', e);
  }
};

let requestId = 0;

const load = async (append = false) => {
  if (!conversationId.value) return;
  if (append && (!hasMore.value || loadingMore.value || loading.value)) return;

  const current = append ? page.value + 1 : 1;
  const id = ++requestId;
  if (append) loadingMore.value = true;
  else loading.value = true;

  try {
    const res = await searchChatRecord({
      conversationId: conversationId.value,
      isGroup: isGroup.value,
      page: { size: DEFAULT_CHAT_HISTORY_PAGE_SIZE, current, total: 0 },
      startTime: rangeStart.value,
      endTime: rangeEnd.value,
      sendUser: objectFilter.value || undefined,
      textTypes: selectedTypes.value,
      keyword: keyword.value.trim() || undefined,
    });
    if (id !== requestId) return;
    if (append) {
      items.value = [...items.value, ...res];
      page.value = current;
    } else {
      items.value = res;
      page.value = 1;
    }
    hasMore.value = res.length >= DEFAULT_CHAT_HISTORY_PAGE_SIZE;
  } catch (e) {
    if (id !== requestId) return;
    console.error('加载聊天记录失败:', e);
    if (!append) {
      items.value = [];
      hasMore.value = false;
    }
    showToast(t('common.requestFailed'));
  } finally {
    if (id === requestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
};

const resetFilters = () => {
  datePreset.value = 'all';
  customStart.value = '';
  customEnd.value = '';
  objectFilter.value = '';
  typeKey.value = 'all';
  keyword.value = '';
  void load(false);
};

let keywordTimer: ReturnType<typeof setTimeout> | null = null;
watch(keyword, () => {
  if (keywordTimer) clearTimeout(keywordTimer);
  keywordTimer = setTimeout(() => void load(false), 350);
});

watch([datePreset, customStart, customEnd, objectFilter, typeKey], () => {
  void load(false);
});

const goBack = () => router.back();

onMounted(async () => {
  if (!userInfo.value) await loadUserInfo();
  void loadMembers();
  void load(false);
});
</script>

<template>
  <div class="history-page">
    <van-nav-bar
      :title="t('chatHistory.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="peer-bar">
      <span class="peer-name">{{ conversationTitle }}</span>
    </div>

    <div class="search-bar">
      <input
        v-model="keyword"
        class="search-input"
        type="search"
        :placeholder="t('chatHistory.searchPlaceholder')"
      />
    </div>

    <div class="filter-panel">
      <div class="chip-row">
        <button
          v-for="opt in dateOptions"
          :key="opt.value"
          class="chip"
          :class="{ active: datePreset === opt.value }"
          @click="datePreset = opt.value"
        >
          {{ t(opt.label) }}
        </button>
      </div>
      <div v-if="datePreset === 'custom'" class="custom-range">
        <input v-model="customStart" type="date" class="date-input" />
        <span class="range-sep">~</span>
        <input v-model="customEnd" type="date" class="date-input" />
      </div>
      <div class="filter-row">
        <select v-model="objectFilter" class="object-select">
          <option
            v-for="opt in objectOptions"
            :key="opt.value || 'all'"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
        <button class="reset-btn" @click="resetFilters">
          {{ t('chatHistory.reset') }}
        </button>
      </div>
      <div class="chip-row">
        <button
          v-for="opt in typeOptions"
          :key="opt.value"
          class="chip"
          :class="{ active: typeKey === opt.value }"
          @click="typeKey = opt.value"
        >
          {{ t(opt.label) }}
        </button>
      </div>
    </div>

    <div class="list">
      <div v-if="loading" class="state">
        <div class="spinner"></div>
        <span>{{ t('chatHistory.loading') }}</span>
      </div>
      <div v-else-if="displayItems.length === 0" class="state">
        <div class="empty-title">{{ t('chatHistory.empty') }}</div>
        <div class="empty-hint">{{ t('chatHistory.emptyHint') }}</div>
      </div>
      <template v-else>
        <div v-for="group in dateGroups" :key="group.date">
          <div class="date-header">{{ group.date }}</div>
          <div v-for="item in group.items" :key="item.nano_id" class="item">
            <div class="item-head">
              <span class="sender">{{ senderName(item.send_user) }}</span>
              <span class="type-tag">{{ kindLabel(item.kind) }}</span>
              <span class="item-time">{{ timeLabel(item.timestamp) }}</span>
            </div>
            <div class="preview">{{ item.preview }}</div>
          </div>
        </div>
        <div class="load-more">
          <button
            v-if="hasMore"
            class="load-more-btn"
            :disabled="loadingMore"
            @click="load(true)"
          >
            {{ loadingMore ? t('chatHistory.loading') : t('chatHistory.loadMore') }}
          </button>
          <span v-else class="no-more">{{ t('chatHistory.noMore') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="less">
.history-page {
  min-height: 100vh;
  padding-bottom: 32px;
  background: var(--page-bg);

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.peer-bar {
  padding: 10px 16px 0;
}

.peer-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.search-bar {
  padding: 10px 16px 0;
}

.search-input {
  width: 100%;
  height: 38px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 19px;
  outline: none;

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.filter-panel {
  padding: 10px 16px 4px;
}

.chip-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 4px 0;
  overflow-x: auto;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex-shrink: 0;
  height: 28px;
  padding: 0 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 14px;

  &.active {
    color: #fff;
    background: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.custom-range {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
}

.date-input {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.range-sep {
  color: var(--text-placeholder);
}

.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}

.object-select {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.reset-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--color-primary);
  background: transparent;
  border: none;
}

.list {
  padding: 4px 16px 0;
}

.state {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  font-size: 13px;
  color: var(--text-placeholder);
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-title {
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 12px;
}

.date-header {
  padding: 12px 2px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-placeholder);
}

.item {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
}

.item-head {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.sender {
  max-width: 40%;
  overflow: hidden;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.type-tag {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  color: var(--color-primary);
  background: var(--color-primary-bg, rgba(64, 150, 255, 10%));
  border-radius: 4px;
}

.item-time {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-placeholder);
}

.preview {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}

.load-more-btn {
  height: 32px;
  padding: 0 20px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 16px;
}

.no-more {
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
