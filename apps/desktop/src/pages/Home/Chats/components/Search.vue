<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import { isRecallMessage } from '@/utils/recall';
import { invoke } from '@tauri-apps/api/core';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import type { ChatSessionVo } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from './styles/Search.module.less';

const emit = defineEmits<{
  (e: 'select', item: ChatSessionVo): void;
}>();

const { t } = useI18n();
const value = ref('');
const isFocus = ref(false);
const searchResults = ref<ChatSessionVo[]>([]);
const searching = ref(false);
const containerRef = ref<HTMLDivElement>();
const inputRef = ref<HTMLInputElement>();
const dropdownStyle = ref<Record<string, string | number>>({});

// 格式化消息内容
const formatMessage = (message: string, textType: number): string => {
  if (isRecallMessage(textType, message)) {
    return '撤回了一条消息';
  }
  if (textType === 2 || textType === 2002) {
    return '[图片]';
  }
  if (textType === 3 || textType === 2003) {
    return '[文件]';
  }
  if (textType === 21 || textType === 2006) {
    return '[语音]';
  }
  if (textType === 5) {
    return '[视频通话]';
  }
  if (textType === 2004) {
    return '[群通知]';
  }
  try {
    const parsed = JSON.parse(message);
    if (parsed.text) {
      return parsed.text;
    }
  } catch (e) {
    // 解析失败，直接返回原始消息
  }
  return message;
};

const handleSearch = async (keyword: string) => {
  if (!keyword.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const res = (await invoke('search_chat_session', {
      keyword: keyword.trim(),
    })) as ChatSessionVo[];
    searchResults.value = res;
  } catch (e) {
    console.error('搜索会话失败:', e);
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
};

const updateDropdownPosition = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    dropdownStyle.value = {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    };
  }
};

watch([isFocus, value], () => {
  if (isFocus.value && value.value.trim()) {
    nextTick(updateDropdownPosition);
  }
});

const handleChange = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  value.value = val;
  handleSearch(val);
};

const handleSelect = (item: ChatSessionVo) => {
  emit('select', item);
  value.value = '';
  searchResults.value = [];
  isFocus.value = false;
};

const handleClose = () => {
  isFocus.value = false;
};

const displayList = computed(() => {
  if (!value.value.trim()) return [];
  return searchResults.value;
});

const showDropdown = computed(() => isFocus.value && !!value.value.trim());

const highlightParts = (text: string, keyword: string) => {
  if (!keyword.trim()) return { before: text, match: '', after: '' };

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);

  if (index === -1) return { before: text, match: '', after: '' };

  return {
    before: text.slice(0, index),
    match: text.slice(index, index + keyword.length),
    after: text.slice(index + keyword.length),
  };
};

const focusInput = () => {
  inputRef.value?.focus();
};
</script>

<template>
  <div :class="styles.searchContainer" ref="containerRef">
    <div :class="styles.searchWrapper" @click="focusInput">
      <SearchOutlined :class="styles.searchIcon" />
      <input
        ref="inputRef"
        :class="styles.searchInput"
        :placeholder="t('search.placeholder')"
        :value="value"
        @input="handleChange"
        @focus="isFocus = true"
      />
    </div>
    <Teleport to="body">
      <div v-if="showDropdown" :class="styles.overlay" @click="handleClose">
        <div
          :class="styles.dropdownContainer"
          :style="dropdownStyle"
          @click.stop
        >
          <div v-if="searching" :class="styles.emptyTip">
            {{ t('search.searching') }}
          </div>
          <template v-else-if="displayList.length > 0">
            <div
              v-for="item in displayList"
              :key="item.nano_id"
              :class="styles.searchItem"
              @click="handleSelect(item)"
            >
              <div :class="styles.itemInfo">
                <div :class="styles.itemName">
                  <template v-for="(part, idx) in [highlightParts(item.friend_name, value)]" :key="idx">
                    {{ part.before }}<span v-if="part.match" :class="styles.highlight">{{ part.match }}</span>{{ part.after }}
                  </template>
                  <UserTypeTag v-if="item.session_type !== 2" :type="item.friend_user_type" />
                  <span v-if="item.session_type === 2" :class="styles.groupTag">
                    {{ t('search.groupTag') }}
                  </span>
                </div>
                <div :class="styles.itemDesc">
                  <template
                    v-for="(part, idx) in [highlightParts(formatMessage(item.last_message, item.text_type), value)]"
                    :key="idx"
                  >
                    {{ part.before }}<span v-if="part.match" :class="styles.highlight">{{ part.match }}</span>{{ part.after }}
                  </template>
                </div>
              </div>
            </div>
          </template>
          <div v-else :class="styles.emptyTip">
            {{ t('search.noResults') }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
