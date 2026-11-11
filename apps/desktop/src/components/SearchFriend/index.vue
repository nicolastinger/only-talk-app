<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  add_friend,
  cache_user_info,
  getFiles,
  isHttpSuccess,
  search_user_by_account,
} from '@workspace/services';
import type { FriendRequestInfoDTO, UserInfo } from '@workspace/types';
import styles from './index.module.less';

const { t } = useI18n();

const formRef = ref<{ resetFields: () => void } | null>(null);
const formModel = reactive({ searchKey: '' });
const loading = ref(false);
const results = ref<UserInfo[]>([]);
const isModalVisible = ref(false);
const currentUser = ref<{
  userId: string;
  username: string;
} | null>(null);
const requestMessage = ref('');
const avatarUrls = ref<{ [key: string]: string }>({});

const handleSearch = async (values: { searchKey: string }) => {
  loading.value = true;
  try {
    const result = await search_user_by_account(values.searchKey);
    console.log(result);
    if (result.netSuccess && isHttpSuccess(result.res.status)) {
      const data = JSON.parse(result.res.body);
      const users: UserInfo = data.data;
      results.value = [users];
      cache_user_info(users).catch((err) => {
        console.error('缓存用户信息失败:', err);
      });
    }
  } catch (error) {
    feedback.message.error(t('friendRequest.searchError'));
  }
  loading.value = false;
};

const showModal = (userId: string, username: string) => {
  currentUser.value = { userId, username };
  requestMessage.value = '';
  isModalVisible.value = true;
};

const handleCancel = () => {
  isModalVisible.value = false;
  currentUser.value = null;
  requestMessage.value = '';
};

const handleAddFriend = async () => {
  if (!currentUser.value) return;

  try {
    const me = (await invoke('get_user_map', { key: 'uuid' })) as string;

    const friendData: FriendRequestInfoDTO = {
      request_message: requestMessage.value,
      accept_message: '',
      request_user: me,
      accept_user: currentUser.value.userId,
      add_type: 'search',
      version: 0,
      accept_status: 0,
    };

    const result = await add_friend(friendData);
    console.log('请求结果', result);
    if (result.netSuccess && isHttpSuccess(result.res.status)) {
      feedback.message.success(
        t('friendRequest.requestSent', {
          username: currentUser.value.username,
        }),
      );
      handleCancel();
    } else {
      feedback.message.error(t('friendRequest.sendFailed'));
    }
  } catch (error) {
    feedback.message.error(t('friendRequest.sendError'));
  }
};

const handleClear = () => {
  formRef.value?.resetFields();
  formModel.searchKey = '';
  results.value = [];
};

const getUserIcon = async (icon: string): Promise<string> => {
  try {
    const FileVos = await getFiles(icon);

    return FileVos?.[0]?.tauri_file_path || '';
  } catch (error) {
    feedback.message.error(t('friendRequest.avatarError'));

    console.log(error);
    return '';
  }
};

watch(results, async (list) => {
  const newAvatarUrls: { [key: string]: string } = {};
  for (const item of list) {
    if (item.icon && item.uuid) {
      newAvatarUrls[item.uuid] = await getUserIcon(item.icon);
    }
  }
  avatarUrls.value = newAvatarUrls;
});
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.header">
      <div :class="styles.title">
        {{ t('searchFriend.title') }}
      </div>
    </div>
    <div :class="styles.content">
      <a-form ref="formRef" :model="formModel" @finish="handleSearch">
        <a-form-item
          name="searchKey"
          :rules="[
            {
              required: true,
              message: t('searchFriend.placeholder'),
            },
          ]"
        >
          <a-input
            v-model:value="formModel.searchKey"
            :placeholder="t('searchFriend.placeholder')"
            allow-clear
          />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" :loading="loading">
            {{ t('searchFriend.submit') }}
          </a-button>
          <a-button style="margin-left: 8px" @click="handleClear">
            {{ t('searchFriend.clear') }}
          </a-button>
        </a-form-item>
      </a-form>

      <a-list v-if="results.length > 0" :data-source="results">
        <template #renderItem="{ item }">
          <a-list-item>
            <template #actions>
              <a-button
                :key="item.uuid"
                type="primary"
                @click="showModal(item.uuid || '', item.username || '')"
              >
                {{ t('friendRequest.addFriend') }}
              </a-button>
            </template>
            <a-list-item-meta>
              <template #avatar>
                <a-avatar :src="avatarUrls[item.uuid || ''] || DEFAULT_ICON">
                  {{ item.username }}
                </a-avatar>
              </template>
              <template #title>
                <span>
                  {{ item.username }}
                  <UserTypeTag :type="item.user_type" />
                </span>
              </template>
              <template #description>{{ item.info }}</template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
      <div v-else style="text-align: center; padding: 20px">
        {{ t('searchFriend.noData') }}
      </div>
    </div>
    <div :class="styles.footer" />

    <a-modal
      :title="t('friendRequest.addFriendRequest')"
      :open="isModalVisible"
      :closable="false"
      :ok-text="t('friendRequest.sendRequest')"
      :cancel-text="t('friendRequest.cancel')"
      @ok="handleAddFriend"
      @cancel="handleCancel"
    >
      <div v-if="currentUser" style="margin-bottom: 16px">
        <p>
          {{ t('friendRequest.sendTo') }}:
          <strong>{{ currentUser.username }}</strong>
        </p>
      </div>
      <a-form-item :label="t('friendRequest.requestMessage')" required>
        <a-textarea
          v-model:value="requestMessage"
          :rows="4"
          :placeholder="t('friendRequest.requestPlaceholder')"
        />
      </a-form-item>
    </a-modal>
  </div>
</template>
