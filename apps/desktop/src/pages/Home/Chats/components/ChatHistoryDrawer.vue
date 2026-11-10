<script setup lang="ts">
/**
 * 聊天记录抽屉（单聊 / 群聊共用）。
 *
 * 支持按日期、对象（发送者）、消息类型、关键词多维度筛选，
 * 数据来自本地 SQLite（后端 `search_chat_record`），按时间倒序分页。
 */
import { computed, reactive, ref, watch } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  get_group_members,
  resolveMessagePreview,
  searchChatRecord,
  DEFAULT_CHAT_HISTORY_PAGE_SIZE,
} from '@workspace/services';
import type { GroupMemberVo, TextQuicMsgVo } from '@workspace/types';
import { useBearStore } from '@/stores/app';
import { useGroupMemberInfo } from '@/hooks/useGroupMemberInfo';
import { useI18n } from '@/i18n';
import { formatFullTime } from '@/utils/format';
import styles from './styles/ChatHistoryDrawer.module.less';

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 单聊=对方 uuid；群聊=群 uuid */
    conversationId: string;
    isGroup?: boolean;
    /** 单聊对方名称 */
    peerName?: string;
    /** 群聊群名称 */
    groupName?: string;
  }>(),
  {
    isGroup: false,
    peerName: '',
    groupName: '',
  },
);

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const { t } = useI18n();
const store = useBearStore();

const meUuid = computed(() => store.userInfo?.uuid || '');

/** 类型筛选分组（单聊/群聊类型一起命中） */
const TYPE_GROUPS = [
  { key: 'text', types: [1, 2001] },
  { key: 'image', types: [2, 2002] },
  { key: 'file', types: [3, 2003] },
  { key: 'voice', types: [21, 2006] },
];

const datePreset = ref<'all' | 'today' | '7d' | '30d' | 'custom'>('all');
const customRange = ref<[Dayjs, Dayjs] | null>(null);
const objectFilter = ref('');
const selectedTypeKeys = ref<string[]>([]);
const keyword = ref('');

const items = ref<TextQuicMsgVo[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
const page = ref(1);

/** 群成员（用于「对象」筛选与发送者名称） */
const groupMembers = ref<GroupMemberVo[]>([]);
const memberUuids = reactive<string[]>([]);
const { memberInfoMap } = useGroupMemberInfo(memberUuids);

const dateOptions = computed(() => [
  { value: 'all', label: t('chatHistory.dateAll') },
  { value: 'today', label: t('chatHistory.today') },
  { value: '7d', label: t('chatHistory.last7Days') },
  { value: '30d', label: t('chatHistory.last30Days') },
  { value: 'custom', label: t('chatHistory.custom') },
]);

const typeOptions = computed(() =>
  TYPE_GROUPS.map((group) => ({
    value: group.key,
    label: t(`chatHistory.type${group.key[0].toUpperCase()}${group.key.slice(1)}`),
  })),
);

const objectOptions = computed(() => {
  const options = [{ value: '', label: t('chatHistory.objectAll') }];
  if (meUuid.value) options.push({ value: meUuid.value, label: t('chatHistory.me') });
  if (props.isGroup) {
    for (const member of groupMembers.value) {
      if (member.user_uuid === meUuid.value) continue;
      const info = memberInfoMap.value.get(member.user_uuid);
      options.push({
        value: member.user_uuid,
        label: member.nickname || info?.username || member.user_uuid,
      });
    }
  } else if (props.conversationId && props.conversationId !== meUuid.value) {
    options.push({
      value: props.conversationId,
      label: props.peerName || props.conversationId,
    });
  }
  return options;
});

const selectedTypes = computed(() => {
  const types: number[] = [];
  for (const group of TYPE_GROUPS) {
    if (selectedTypeKeys.value.includes(group.key)) types.push(...group.types);
  }
  return types;
});

const rangeStart = computed(() => {
  const now = dayjs();
  switch (datePreset.value) {
    case 'today':
      return now.startOf('day').valueOf();
    case '7d':
      return now.startOf('day').subtract(6, 'day').valueOf();
    case '30d':
      return now.startOf('day').subtract(29, 'day').valueOf();
    case 'custom':
      return customRange.value?.[0]?.startOf('day').valueOf();
    default:
      return undefined;
  }
});

const rangeEnd = computed(() => {
  if (datePreset.value === 'custom') {
    return customRange.value?.[1]?.endOf('day').valueOf();
  }
  if (datePreset.value === 'all') return undefined;
  return dayjs().endOf('day').valueOf();
});

/** 展示项：解析预览文案 + 类型标签 */
const displayItems = computed(() =>
  items.value.map((msg) => {
    const preview = resolveMessagePreview(msg.text_type, msg.raw, t);
    return {
      ...msg,
      preview: preview.text,
      kind: preview.kind,
    };
  }),
);

/** 按日期分组（结果已按时间倒序） */
const dateGroups = computed(() => {
  const groups: { date: string; items: typeof displayItems.value }[] = [];
  for (const item of displayItems.value) {
    const date = dayjs(item.timestamp).format('YYYY-MM-DD');
    let group = groups[groups.length - 1];
    if (!group || group.date !== date) {
      group = { date, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
});

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
  if (!props.isGroup) {
    return uuid === props.conversationId
      ? props.peerName || uuid
      : uuid;
  }
  const member = groupMembers.value.find((m) => m.user_uuid === uuid);
  return member?.nickname || memberInfoMap.value.get(uuid)?.username || uuid;
};

const loadMembers = async () => {
  if (!props.isGroup || !props.conversationId) {
    groupMembers.value = [];
    memberUuids.splice(0, memberUuids.length);
    return;
  }
  try {
    const list = (await get_group_members(props.conversationId)) || [];
    groupMembers.value = list;
    memberUuids.splice(
      0,
      memberUuids.length,
      ...list.map((m) => m.user_uuid).filter(Boolean),
    );
  } catch (e) {
    console.error('加载群成员失败:', e);
    groupMembers.value = [];
    memberUuids.splice(0, memberUuids.length);
  }
};

let requestId = 0;

const load = async (append = false) => {
  if (!props.conversationId) return;
  if (append && (!hasMore.value || loadingMore.value || loading.value)) return;

  const current = append ? page.value + 1 : 1;
  const id = ++requestId;
  if (append) loadingMore.value = true;
  else loading.value = true;

  try {
    const res = await searchChatRecord({
      conversationId: props.conversationId,
      isGroup: props.isGroup,
      page: {
        size: DEFAULT_CHAT_HISTORY_PAGE_SIZE,
        current,
        total: 0,
      },
      startTime: rangeStart.value,
      endTime: rangeEnd.value,
      sendUser: objectFilter.value || undefined,
      textTypes: selectedTypes.value.length ? selectedTypes.value : undefined,
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
  } finally {
    if (id === requestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
};

const resetFilters = () => {
  datePreset.value = 'all';
  customRange.value = null;
  objectFilter.value = '';
  selectedTypeKeys.value = [];
  keyword.value = '';
  void load(false);
};

const initOnOpen = () => {
  if (!props.open) return;
  void loadMembers();
  void load(false);
};

watch(
  () => props.open,
  (open) => {
    if (open) initOnOpen();
  },
);

watch(
  () => props.conversationId,
  () => {
    if (props.open) {
      datePreset.value = 'all';
      customRange.value = null;
      objectFilter.value = '';
      selectedTypeKeys.value = [];
      keyword.value = '';
      initOnOpen();
    }
  },
);

// 筛选项变化后重新查询（关键词单独防抖）
watch([datePreset, customRange, objectFilter, selectedTypeKeys], () => {
  if (props.open) void load(false);
});

let keywordTimer: ReturnType<typeof setTimeout> | null = null;
watch(keyword, () => {
  if (keywordTimer) clearTimeout(keywordTimer);
  keywordTimer = setTimeout(() => {
    if (props.open) void load(false);
  }, 350);
});
</script>

<template>
  <a-drawer
    :open="open"
    :title="t('chatHistory.title')"
    placement="right"
    :width="520"
    :body-style="{ padding: '0 16px 16px' }"
    @close="emit('update:open', false)"
  >
    <div :class="styles.toolbar">
      <div :class="styles.subtitle">
        {{ isGroup ? groupName : peerName }}
      </div>
      <a-input-search
        v-model:value="keyword"
        :placeholder="t('chatHistory.searchPlaceholder')"
        allow-clear
        size="small"
      />
      <div :class="styles.filters">
        <a-select
          v-model:value="datePreset"
          size="small"
          :options="dateOptions"
          :class="styles.filterSelect"
        />
        <a-select
          v-model:value="objectFilter"
          size="small"
          :options="objectOptions"
          :class="styles.filterSelect"
        />
        <a-select
          v-model:value="selectedTypeKeys"
          mode="multiple"
          size="small"
          allow-clear
          :max-tag-count="2"
          :placeholder="t('chatHistory.type')"
          :options="typeOptions"
          :class="styles.filterSelect"
        />
        <a-button size="small" type="link" @click="resetFilters">
          {{ t('chatHistory.reset') }}
        </a-button>
      </div>
      <div v-if="datePreset === 'custom'" :class="styles.customRange">
        <a-range-picker
          v-model:value="customRange"
          size="small"
          :placeholder="[t('chatHistory.startDate'), t('chatHistory.endDate')]"
        />
      </div>
    </div>

    <div :class="styles.body">
      <div v-if="loading" :class="styles.state">
        <a-spin size="small" />
        <span>{{ t('chatHistory.loading') }}</span>
      </div>
      <div v-else-if="displayItems.length === 0" :class="styles.state">
        <div :class="styles.emptyTitle">{{ t('chatHistory.empty') }}</div>
        <div :class="styles.emptyHint">{{ t('chatHistory.emptyHint') }}</div>
      </div>
      <template v-else>
        <div v-for="group in dateGroups" :key="group.date">
          <div :class="styles.dateHeader">{{ group.date }}</div>
          <div
            v-for="item in group.items"
            :key="item.nano_id"
            :class="styles.item"
          >
            <div :class="styles.itemHead">
              <span :class="styles.sender">{{ senderName(item.send_user) }}</span>
              <span :class="styles.typeTag">{{ kindLabel(item.kind) }}</span>
              <span :class="styles.itemTime">
                {{ formatFullTime(item.timestamp) }}
              </span>
            </div>
            <div :class="styles.preview">{{ item.preview }}</div>
          </div>
        </div>
        <div :class="styles.footer">
          <a-button
            v-if="hasMore"
            size="small"
            :loading="loadingMore"
            @click="load(true)"
          >
            {{ t('chatHistory.loadMore') }}
          </a-button>
          <span v-else :class="styles.noMore">{{ t('chatHistory.noMore') }}</span>
        </div>
      </template>
    </div>
  </a-drawer>
</template>
