<script setup lang="ts">
import { onMounted, ref } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import {
  block_friend,
  get_black_list,
  getFiles,
  isHttpSuccess,
  search_user_by_account,
  unblock_friend,
} from '@workspace/services';
import type { BlackListVo, UserInfo } from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t } = useI18n();

const list = ref<BlackListVo[]>([]);
const avatarMap = ref<Map<string, string>>(new Map());
const loading = ref(false);

const searchKey = ref('');
const searching = ref(false);
const searchResult = ref<UserInfo | null>(null);
const searchAvatar = ref('');
const blockConfirmVisible = ref(false);
const blockLoading = ref(false);

const loadList = async () => {
  loading.value = true;
  try {
    const result = await get_black_list();
    const blackList = result || [];
    list.value = blackList;

    const nextAvatarMap = new Map<string, string>();
    for (const item of blackList) {
      if (item.icon) {
        try {
          const files = await getFiles(item.icon);
          if (files?.[0]?.tauri_file_path) {
            nextAvatarMap.set(item.uuid, files[0].tauri_file_path);
          }
        } catch (error) {
          console.log(error);
        }
      }
    }
    avatarMap.value = nextAvatarMap;
  } catch (error) {
    console.error('获取黑名单失败:', error);
    feedback.message.error(t('settings.blacklist.loadFailed'));
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadList();
});

const getUserIcon = async (icon: string): Promise<string> => {
  try {
    const files = await getFiles(icon);
    return files?.[0]?.tauri_file_path || '';
  } catch (error) {
    console.error('获取头像失败:', error);
    return '';
  }
};

const handleSearch = async () => {
  if (!searchKey.value.trim()) return;
  searching.value = true;
  try {
    const result = await search_user_by_account(searchKey.value.trim());
    if (result.netSuccess && isHttpSuccess(result.res.status)) {
      const data = JSON.parse(result.res.body);
      const user: UserInfo = data.data;
      if (user?.uuid) {
        searchResult.value = user;
        searchAvatar.value = await getUserIcon(user.icon || '');
      } else {
        searchResult.value = null;
        feedback.message.info(t('settings.blacklist.notFound'));
      }
    } else {
      feedback.message.error(t('settings.blacklist.notFound'));
    }
  } catch (error) {
    console.error('搜索用户失败:', error);
    feedback.message.error(t('settings.blacklist.notFound'));
  } finally {
    searching.value = false;
  }
};

const handleBlock = async () => {
  if (!searchResult.value?.uuid) return;
  blockLoading.value = true;
  try {
    await block_friend(searchResult.value.uuid);
    feedback.message.success(t('settings.blacklist.blockSuccess'));
    blockConfirmVisible.value = false;
    searchResult.value = null;
    searchKey.value = '';
    searchAvatar.value = '';
    loadList();
  } catch (error) {
    console.error('拉黑失败:', error);
    feedback.message.error(t('settings.blacklist.blockFailed'));
  } finally {
    blockLoading.value = false;
  }
};

const handleUnblock = async (uuid: string) => {
  try {
    await unblock_friend(uuid);
    feedback.message.success(t('settings.blacklist.unblockSuccess'));
    loadList();
  } catch (error) {
    console.error('取消拉黑失败:', error);
    feedback.message.error(t('settings.blacklist.unblockFailed'));
  }
};

const onAvatarError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.blacklist.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.blacklistSearch">
        <a-input
          v-model:value="searchKey"
          :placeholder="t('settings.blacklist.searchPlaceholder')"
          allow-clear
          @press-enter="handleSearch"
        >
          <template #suffix>
            <a-button
              type="primary"
              size="small"
              :loading="searching"
              @click="handleSearch"
            >
              {{ t('settings.blacklist.search') }}
            </a-button>
          </template>
        </a-input>
      </div>

      <div v-if="searchResult" :class="styles.blacklistItem">
        <img
          :class="styles.blacklistAvatar"
          :src="searchAvatar || DEFAULT_ICON"
          alt="avatar"
          @error="onAvatarError"
        />
        <div :class="styles.blacklistIdentity">
          <a-typography-text :class="styles.blacklistName">
            {{ searchResult.username || '-' }}
            <UserTypeTag :type="searchResult.user_type" />
          </a-typography-text>
          <a-typography-text type="secondary" :class="styles.blacklistAccount">
            {{ searchResult.account || '-' }}
          </a-typography-text>
        </div>
        <a-button size="small" danger @click="blockConfirmVisible = true">
          {{ t('settings.blacklist.block') }}
        </a-button>
      </div>

      <a-spin :spinning="loading">
        <a-empty
          v-if="list.length === 0"
          :description="t('settings.blacklist.empty')"
        />
        <template v-else>
          <div
            v-for="item in list"
            :key="item.uuid"
            :class="styles.blacklistItem"
          >
            <img
              :class="styles.blacklistAvatar"
              :src="avatarMap.get(item.uuid) || DEFAULT_ICON"
              alt="avatar"
              @error="onAvatarError"
            />
            <div :class="styles.blacklistIdentity">
              <a-typography-text :class="styles.blacklistName">
                {{ item.username || '-' }}
                <UserTypeTag :type="item.user_type" />
              </a-typography-text>
              <a-typography-text
                type="secondary"
                :class="styles.blacklistAccount"
              >
                {{ item.account || '-' }}
              </a-typography-text>
            </div>
            <a-button size="small" @click="handleUnblock(item.uuid)">
              {{ t('settings.blacklist.unblock') }}
            </a-button>
          </div>
        </template>
      </a-spin>
    </a-card>

    <a-modal
      :title="t('settings.blacklist.blockConfirmTitle')"
      :open="blockConfirmVisible"
      :closable="false"
      :ok-text="t('settings.blacklist.block')"
      :cancel-text="t('settings.blacklist.cancel')"
      :ok-button-props="{ danger: true, loading: blockLoading }"
      @ok="handleBlock"
      @cancel="blockConfirmVisible = false"
    >
      <p v-if="searchResult">
        {{
          t('settings.blacklist.blockConfirmMsg', {
            name: searchResult.username || searchResult.account,
          })
        }}
      </p>
    </a-modal>
  </div>
</template>
