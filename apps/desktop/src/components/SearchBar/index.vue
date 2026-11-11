<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { BellOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import FriendRequestsModal from '@/components/FriendRequestsModal/index.vue';
import InvitationManager from '@/pages/Home/Contacts/components/InvitationManager.vue';
import { useBearStore } from '@/stores/app';
import type { FriendVo, GroupVo } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

interface SearchResultItem {
  id: string;
  name: string;
  type: 'friend' | 'group';
  data: FriendVo | GroupVo;
}

const props = defineProps<{
  onSearchSelect?: (item: SearchResultItem) => void;
}>();

const emit = defineEmits<{
  (e: 'search-select', item: SearchResultItem): void;
}>();

const { t } = useI18n();
const store = useBearStore();
const menuUnread = computed(() => store.menuUnread);

const friendModalVisible = ref(false);
const groupModalVisible = ref(false);
const value = ref('');
const isFocus = ref(false);
const searchResults = ref<SearchResultItem[]>([]);
const searching = ref(false);
const containerRef = ref<HTMLDivElement>();
const dropdownStyle = ref<Record<string, string | number>>({});

const handleSearch = async (keyword: string) => {
  if (!keyword.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const [friends, groups] = await Promise.all([
      invoke('search_friend', { keyword: keyword.trim() }) as Promise<
        FriendVo[]
      >,
      invoke('search_group', { keyword: keyword.trim() }) as Promise<GroupVo[]>,
    ]);
    const results: SearchResultItem[] = [
      ...friends.map((f) => ({
        id: f.friend_id,
        name: f.friend_name,
        type: 'friend' as const,
        data: f,
      })),
      ...groups.map((g) => ({
        id: g.group_uuid,
        name: g.group_name,
        type: 'group' as const,
        data: g,
      })),
    ];
    searchResults.value = results;
  } catch (e) {
    console.error('搜索好友/群聊失败:', e);
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

const handleSelect = (item: SearchResultItem) => {
  props.onSearchSelect?.(item);
  emit('search-select', item);
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

const handleFriendNotificationClick = () => {
  friendModalVisible.value = true;
};

const handleFriendModalClose = () => {
  friendModalVisible.value = false;
};

const handleGroupNotificationClick = () => {
  groupModalVisible.value = true;
};

const handleGroupModalClose = () => {
  groupModalVisible.value = false;
};

const showDropdown = computed(() => isFocus.value && !!value.value.trim());

const getFriendAccount = (data: FriendVo | GroupVo) =>
  (data as FriendVo).friend_account;

const getGroupMemberCount = (data: FriendVo | GroupVo) =>
  (data as GroupVo).member_count;

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
</script>

<template>
  <div :class="styles.container" ref="containerRef">
    <div :class="styles.searchWrapper">
      <SearchOutlined :class="styles.searchIcon" />
      <input
        :class="styles.searchInput"
        :placeholder="t('searchBar.search')"
        :value="value"
        @input="handleChange"
        @focus="isFocus = true"
      />
    </div>
    <Teleport to="body">
      <div v-if="showDropdown" :class="styles.overlay" @click="handleClose">
        <div :class="styles.dropdownContainer" :style="dropdownStyle" @click.stop>
          <div v-if="searching" :class="styles.emptyTip">
            {{ t('search.searching') }}
          </div>
          <template v-else-if="displayList.length > 0">
            <div
              v-for="item in displayList"
              :key="`${item.type}-${item.id}`"
              :class="styles.searchItem"
              @click="handleSelect(item)"
            >
              <div :class="styles.itemInfo">
                <div :class="styles.itemName">
                  <template
                    v-for="(part, idx) in [highlightParts(item.name, value)]"
                    :key="idx"
                  >
                    {{ part.before }}<span v-if="part.match" :class="styles.highlight">{{ part.match }}</span>{{ part.after }}
                  </template>
                  <span
                    :class="item.type === 'group' ? styles.groupTag : styles.friendTag"
                  >
                    {{
                      item.type === 'group'
                        ? t('search.groupTag')
                        : t('search.friendTag')
                    }}
                  </span>
                </div>
                <div :class="styles.itemDesc">
                  <template v-if="item.type === 'friend'">
                    <template
                      v-for="(part, idx) in [
                        highlightParts(getFriendAccount(item.data), value),
                      ]"
                      :key="idx"
                    >
                      {{ part.before }}<span v-if="part.match" :class="styles.highlight">{{ part.match }}</span>{{ part.after }}
                    </template>
                  </template>
                  <template v-else>
                    {{ t('search.memberCount') }}:
                    {{ getGroupMemberCount(item.data) }}
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
    <div :class="styles.actionBar">
      <div :class="styles.actionBtn" @click="handleFriendNotificationClick">
        <a-badge
          :count="menuUnread.contacts > 99 ? '99+' : menuUnread.contacts"
          :overflow-count="99"
          size="small"
        >
          <BellOutlined :class="styles.actionIcon" />
        </a-badge>
        <span>{{ t('searchBar.friendNotification') }}</span>
      </div>
      <div :class="styles.divider" />
      <div :class="styles.actionBtn" @click="handleGroupNotificationClick">
        <a-badge
          :count="menuUnread.groups > 99 ? '99+' : menuUnread.groups"
          :overflow-count="99"
          size="small"
        >
          <TeamOutlined :class="styles.actionIcon" />
        </a-badge>
        <span>{{ t('searchBar.groupNotification') }}</span>
      </div>
    </div>
    <FriendRequestsModal
      :visible="friendModalVisible"
      @close="handleFriendModalClose"
    />
    <InvitationManager
      :visible="groupModalVisible"
      @cancel="handleGroupModalClose"
    />
  </div>
</template>
