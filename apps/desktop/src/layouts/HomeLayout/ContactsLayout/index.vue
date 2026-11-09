<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import type { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import SearchBar from '@/components/SearchBar/index.vue';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import CreateGroupModal from '@/pages/Home/Contacts/components/CreateGroupModal.vue';
import FriendList from '@/pages/Home/Contacts/components/FriendList.vue';
import GroupList from '@/pages/Home/Contacts/components/GroupList.vue';
import { useI18n } from '@/i18n';
import type { GroupInfoVo } from '@workspace/types';
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

const tabOptions = ['friends', 'groups'];

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
    url: `/search/friend`,
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
    <div :class="styles.left">
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
              <span>{{ value === 'friends' ? '好友' : '群组' }}</span>
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
