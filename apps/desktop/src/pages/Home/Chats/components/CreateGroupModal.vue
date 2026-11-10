<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  create_group,
  create_group_chat_session,
  get_friend_list,
  invite_group_members,
} from '@workspace/services';
import type { FriendVo, GroupInfoVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'success', groupId?: string): void;
}>();

const router = useRouter();
const groupName = ref('');
const selectedFriends = ref<string[]>([]);
const friendList = ref<FriendVo[]>([]);
const loading = ref(false);

const loadFriends = async () => {
  try {
    const friends = await get_friend_list();
    friendList.value = friends;
  } catch (err) {
    console.log('获取好友列表失败', err);
  }
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadFriends();
      groupName.value = '';
      selectedFriends.value = [];
    }
  },
);

const handleCreate = async () => {
  if (!groupName.value.trim()) {
    feedback.message.warning(t('contacts.createGroup.nameRequired'));
    return;
  }
  loading.value = true;
  try {
    const group: GroupInfoVo = await create_group({
      group_name: groupName.value.trim(),
    });
    if (selectedFriends.value.length > 0) {
      await invite_group_members(group.group_uuid, selectedFriends.value);
    }
    await create_group_chat_session(group.group_uuid);
    feedback.message.success(t('contacts.createGroup.success'));
    emit('success', group.group_uuid);
    emit('cancel');
    router.push('/home/chats/group-chat?groupId=' + group.group_uuid);
  } catch (err) {
    console.log('创建群聊失败', err);
    feedback.message.error(t('contacts.createGroup.failed'));
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-modal
    :title="t('groupSettings.sessionTitle')"
    :open="visible"
    :closable="false"
    :confirm-loading="loading"
    :ok-text="t('contacts.createGroup.create')"
    :cancel-text="t('contacts.createGroup.cancel')"
    @ok="handleCreate"
    @cancel="emit('cancel')"
  >
    <div style="margin-bottom: 16px">
      <label>{{ t('contacts.createGroup.nameLabel') }}</label>
      <a-input
        v-model:value="groupName"
        :placeholder="t('groupSettings.sessionNamePlaceholder')"
        style="margin-top: 8px"
      />
    </div>
    <div>
      <label>{{ t('groupSettings.selectMember') }}</label>
      <a-select
        v-model:value="selectedFriends"
        mode="multiple"
        style="width: 100%; margin-top: 8px"
        :placeholder="t('groupSettings.members.selectFriend')"
        :options="friendList.map((f) => ({ label: f.friend_name, value: f.friend_id }))"
      />
    </div>
  </a-modal>
</template>
