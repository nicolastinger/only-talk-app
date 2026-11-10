<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import type { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import SearchBar from '@/components/SearchBar/index.vue';
import WidthResizer from '@/components/WidthResizer/index.vue';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { toHashRoute } from '@/utils/hashRoute';
import CreateGroupModal from '@/pages/Home/Contacts/components/CreateGroupModal.vue';
import FriendList from '@/pages/Home/Contacts/components/FriendList.vue';
import GroupList from '@/pages/Home/Contacts/components/GroupList.vue';
import { useI18n } from '@/i18n';
import { getConfig, setConfig } from '@workspace/services';
import { CLIENT_CONFIG_KEYS, type GroupInfoVo } from '@workspace/types';
import styles from './index.module.less';

type ContactsTabType = 'friends' | 'groups';

interface SearchResultItem {
  id: string;
  name: string;
  type: 'friend' | 'group';
  data: unknown;
}

const { t } = useI18n();
const router = useRouter();

const activeTab = ref<ContactsTabType>('friends');
const createGroupVisible = ref(false);

/** 好友/群组列表面板宽度约束(px) */
const LIST_MIN_WIDTH = 220;
const LIST_MAX_WIDTH = 480;
const LIST_DEFAULT_WIDTH = 280;
const LIST_MIN_CONTENT_WIDTH = 360;

const listWidth = ref(LIST_DEFAULT_WIDTH);

/** 读取上次保存的面板宽度 */
const loadListWidth = () => {
  const value = Number(getConfig(CLIENT_CONFIG_KEYS.uiContactListWidth));
  if (Number.isFinite(value) && value > 0) {
    listWidth.value = Math.min(
      LIST_MAX_WIDTH,
      Math.max(LIST_MIN_WIDTH, value),
    );
  }
};

/** 拖拽结束后持久化面板宽度 */
const persistListWidth = (value: number) => {
  listWidth.value = value;
  setConfig(CLIENT_CONFIG_KEYS.uiContactListWidth, String(value)).catch(
    () => {},
  );
};

onMounted(loadListWidth);

// 只给 value，不给 label：让 #label 插槽接管渲染（含翻译 + 图标）
// 若直接传字符串数组，antdv 会预置 label，插槽会被忽略，页面就会显示 friends/groups
const tabOptions = [{ value: 'friends' }, { value: 'groups' }];

const handleTabChange = (value: string | number) => {
  activeTab.value = value as ContactsTabType;
};

const handleSearchSelect = (item: SearchResultItem) => {
  if (item.type === 'friend') {
    router.push('/home/contacts/friend?friendId=' + item.id);
  } else {
    router.push('/home/contacts/group?groupId=' + item.id);
  }
};

const openAddFriendWindow = async () => {
  const webviewOptions: WebviewOptions = {
    x: 0,
    y: 0,
    url: toHashRoute('/search/friend'),
    height: 500,
    width: 300,
  };
  const config: WindowOptions = {
    center: true,
  };
  await openNewWindowWithoutClose(
    t('searchBar.addFriend'),
    webviewOptions,
    config,
  );
};

// 右下角悬浮按钮: 好友 tab 添加好友, 群组 tab 添加群组
const handleFabClick = () => {
  if (activeTab.value === 'friends') {
    openAddFriendWindow();
  } else {
    createGroupVisible.value = true;
  }
};

const handleCreateGroupSuccess = (group: GroupInfoVo) => {
  createGroupVisible.value = false;
  router.push('/home/contacts/group?groupId=' + group.group_uuid);
};
</script>

<template>
  <div :class="styles.container">
    <div
      :class="styles.left"
      :style="{ width: `${listWidth}px`, flex: `0 0 ${listWidth}px` }"
    >
      <div :class="styles.header">
        <SearchBar @search-select="handleSearchSelect" />
      </div>
      <div :class="styles.tabContainer">
        <a-segmented
          :value="activeTab"
          :options="tabOptions"
          block
          @change="handleTabChange"
        >
          <template #label="{ value }">
            <div
              :style="{
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }"
            >
              <UserOutlined v-if="value === 'friends'" />
              <TeamOutlined v-else />
              <span>
                {{
                  value === 'friends'
                    ? t('friends.tabFriends')
                    : t('friends.tabGroups')
                }}
              </span>
            </div>
          </template>
        </a-segmented>
      </div>
      <div :class="styles.item" key="contact">
        <FriendList v-if="activeTab === 'friends'" />
        <GroupList v-else />
      </div>
      <div :class="styles.fab" @click="handleFabClick">
        <UserAddOutlined v-if="activeTab === 'friends'" />
        <TeamOutlined v-else />
      </div>
    </div>
    <WidthResizer
      v-model="listWidth"
      :min="LIST_MIN_WIDTH"
      :max="LIST_MAX_WIDTH"
      :min-right="LIST_MIN_CONTENT_WIDTH"
      :default-width="LIST_DEFAULT_WIDTH"
      @change="persistListWidth"
    />
    <div :class="styles.right">
      <router-view />
    </div>
  </div>

  <CreateGroupModal
    :visible="createGroupVisible"
    @cancel="createGroupVisible = false"
    @success="handleCreateGroupSuccess"
  />
</template>
