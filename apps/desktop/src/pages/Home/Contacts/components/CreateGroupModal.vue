<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { create_group } from '@workspace/services';
import type { GroupInfoVo } from '@workspace/types';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'success', group: GroupInfoVo): void;
}>();

const { t } = useI18n();

const groupName = ref('');
const description = ref('');
const maxMembers = ref(500);
const loading = ref(false);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      groupName.value = '';
      description.value = '';
      maxMembers.value = 500;
    }
  },
);

const handleMaxMembersChange = (val: number | string | null) => {
  maxMembers.value = Number(val) || 500;
};

const handleCreate = async () => {
  if (!groupName.value.trim()) {
    feedback.message.warning(t('contacts.createGroup.nameRequired'));
    return;
  }
  loading.value = true;
  try {
    const group: GroupInfoVo = await create_group({
      group_name: groupName.value.trim(),
      avatar: '',
      description: description.value.trim() || undefined,
      max_members: maxMembers.value,
    });
    feedback.message.success(t('contacts.createGroup.success'));
    emit('success', group);
  } catch (err) {
    console.error('创建群聊失败', err);
    feedback.message.error(t('contacts.createGroup.failed'));
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <a-modal
    :title="t('contacts.createGroup.title')"
    :open="visible"
    :closable="false"
    :confirm-loading="loading"
    :ok-text="t('contacts.createGroup.create')"
    :cancel-text="t('contacts.createGroup.cancel')"
    @ok="handleCreate"
    @cancel="emit('cancel')"
  >
    <div style="margin-bottom: 16px">
      <label>
        {{ t('contacts.createGroup.nameLabel') }}
        <span style="color: red">*</span>
      </label>
      <a-input
        v-model:value="groupName"
        :placeholder="t('contacts.createGroup.namePlaceholder')"
        :maxlength="100"
        show-count
        style="margin-top: 8px"
      />
    </div>
    <div style="margin-bottom: 16px">
      <label>
        {{ t('contacts.createGroup.descLabel') }}
      </label>
      <a-textarea
        v-model:value="description"
        :placeholder="t('contacts.createGroup.descPlaceholder')"
        :maxlength="500"
        show-count
        :rows="3"
        style="margin-top: 8px"
      />
    </div>
    <div>
      <label>
        {{ t('contacts.createGroup.maxMembersLabel') }}
      </label>
      <a-input-number
        :value="maxMembers"
        :min="1"
        :max="9999"
        style="width: 100%; margin-top: 8px"
        @change="handleMaxMembersChange"
      />
    </div>
  </a-modal>
</template>
