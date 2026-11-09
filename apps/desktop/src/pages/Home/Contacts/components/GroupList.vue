<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { get_group_list, getFiles } from '@workspace/services';
import type { GroupListItemVo } from '@workspace/types';
import styles from './styles/GroupList.module.less';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const store = useBearStore();

const groups = ref<GroupListItemVo[]>([]);
const groupIcons = reactive<Record<string, string | null>>({});

const selectedGroupId = computed(() => (route.query.groupId as string) || '');

const getGroupIcon = async (group: GroupListItemVo) => {
  try {
    const FileVos = await getFiles(group.avatar || '');
    groupIcons[group.group_uuid] = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.log(error);
  }
};

const getGroupList = async () => {
  try {
    const groupList = await get_group_list();
    console.log('群组列表', groupList);
    groups.value = groupList || [];
    groups.value.forEach((group) => {
      if (group.avatar) {
        getGroupIcon(group);
      }
    });
  } catch (error) {
    console.error('获取群组列表失败', error);
    feedback.message.error(t('contacts.groupList.fetchError'));
  }
};

onMounted(() => {
  getGroupList();
});

watch(
  () => store.refreshFlag,
  (refreshFlag) => {
    if (refreshFlag > 0) {
      getGroupList();
    }
  },
);

const routeToGroupInfo = (groupId: string) => {
  router.push('/home/contacts/group?groupId=' + groupId);
};

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.listContent">
      <template v-if="groups.length > 0">
        <div
          v-for="group in groups"
          :key="group.group_uuid"
          :class="[
            styles.groupBox,
            selectedGroupId === group.group_uuid ? styles.selected : '',
          ]"
          @click="routeToGroupInfo(group.group_uuid)"
        >
          <div :class="styles.left">
            <a-badge>
              <img
                :src="groupIcons[group.group_uuid] || DEFAULT_ICON"
                :class="styles.imgItem"
                alt="avatar"
                @error="handleImgError"
              />
            </a-badge>
          </div>
          <div :class="styles.center">
            <div :class="styles.centerTitle">{{ group.group_name }}</div>
            <div :class="styles.centerText">
              {{ group.member_count }}
              {{ t('contacts.groupList.members') }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
