<script setup lang="ts">
import { ref, watch } from 'vue';
import { DEFAULT_ICON } from '@/constants';
import { get_friend_list, get_group_list, getFiles } from '@workspace/services';
import type { FriendVo, GroupListItemVo } from '@workspace/types';
import { useI18n } from '@/i18n';
import styles from './styles/ForwardModal.module.less';

interface ForwardTarget {
  recv: string;
  isGroup: boolean;
  name: string;
}

const props = defineProps<{
  open: boolean;
  count: number;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm', target: ForwardTarget): void;
}>();

const { t } = useI18n();
const tab = ref<'friend' | 'group'>('friend');
const friends = ref<FriendVo[]>([]);
const groups = ref<GroupListItemVo[]>([]);
const loading = ref(false);
const selectedKey = ref('');
const avatars = ref<Record<string, string>>({});

// 好友/群头像存的是 biz_id，需要解析为本地可访问 url
const resolveAvatars = async (fs: FriendVo[], gs: GroupListItemVo[]) => {
  const targets: { key: string; icon?: string }[] = [
    ...fs.map((f) => ({ key: `f:${f.friend_id}`, icon: f.friend_icon })),
    ...gs.map((g) => ({ key: `g:${g.group_uuid}`, icon: g.avatar })),
  ];
  const entries = await Promise.all(
    targets.map(async ({ key, icon }) => {
      if (!icon) return null;
      try {
        const files = await getFiles(icon);
        const url = files?.[0]?.tauri_file_path || '';
        return url ? ([key, url] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  const next = { ...avatars.value };
  entries.forEach((entry) => {
    if (entry) next[entry[0]] = entry[1];
  });
  avatars.value = next;
};

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedKey.value = '';
    loading.value = true;
    Promise.all([
      get_friend_list().catch(() => [] as FriendVo[]),
      get_group_list().catch(() => [] as GroupListItemVo[]),
    ])
      .then(([f, g]) => {
        const friendList = f || [];
        const groupList = g || [];
        friends.value = friendList;
        groups.value = groupList;
        resolveAvatars(friendList, groupList);
      })
      .finally(() => {
        loading.value = false;
      });
  },
  { immediate: true },
);

const confirm = () => {
  if (!selectedKey.value) return;
  const [type, id] = selectedKey.value.split(':');
  if (type === 'f') {
    const f = friends.value.find((x) => x.friend_id === id);
    emit('confirm', { recv: id, isGroup: false, name: f?.friend_name || id });
  } else {
    const g = groups.value.find((x) => x.group_uuid === id);
    emit('confirm', { recv: id, isGroup: true, name: g?.group_name || id });
  }
};

const handleImgError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <a-modal
    :open="open"
    :title="t('chat.forward.title')"
    :ok-text="`${t('chat.forward.send')} (${count})`"
    :cancel-text="t('chat.messageActions.cancel')"
    :ok-button-props="{ disabled: !selectedKey || count === 0 }"
    destroy-on-close
    @ok="confirm"
    @cancel="emit('cancel')"
  >
    <a-spin :spinning="loading">
      <div :class="styles.tabs">
        <button
          type="button"
          :class="[styles.tab, tab === 'friend' ? styles.active : '']"
          @click="tab = 'friend'"
        >
          {{ t('chat.forward.friends') }}
        </button>
        <button
          type="button"
          :class="[styles.tab, tab === 'group' ? styles.active : '']"
          @click="tab = 'group'"
        >
          {{ t('chat.forward.groups') }}
        </button>
      </div>
      <div :class="styles.body">
        <template v-if="tab === 'friend'">
          <div v-if="friends.length > 0" :class="styles.list">
            <div
              v-for="f in friends"
              :key="f.friend_id"
              :class="[
                styles.item,
                selectedKey === `f:${f.friend_id}` ? styles.selected : '',
              ]"
              @click="selectedKey = `f:${f.friend_id}`"
            >
              <img
                :src="avatars[`f:${f.friend_id}`] || DEFAULT_ICON"
                alt=""
                :width="36"
                :height="36"
                :style="{ borderRadius: '50%', objectFit: 'cover' }"
                @error="handleImgError"
              />
              <span :class="styles.name">{{ f.friend_name }}</span>
              <span
                :class="[
                  styles.radio,
                  selectedKey === `f:${f.friend_id}` ? styles.on : '',
                ]"
              />
            </div>
          </div>
          <div v-else :class="styles.empty">
            {{ t('chat.forward.noFriends') }}
          </div>
        </template>
        <template v-else>
          <div v-if="groups.length > 0" :class="styles.list">
            <div
              v-for="g in groups"
              :key="g.group_uuid"
              :class="[
                styles.item,
                selectedKey === `g:${g.group_uuid}` ? styles.selected : '',
              ]"
              @click="selectedKey = `g:${g.group_uuid}`"
            >
              <img
                :src="avatars[`g:${g.group_uuid}`] || DEFAULT_ICON"
                alt=""
                :width="36"
                :height="36"
                :style="{ borderRadius: '50%', objectFit: 'cover' }"
                @error="handleImgError"
              />
              <span :class="styles.name">{{ g.group_name }}</span>
              <span
                :class="[
                  styles.radio,
                  selectedKey === `g:${g.group_uuid}` ? styles.on : '',
                ]"
              />
            </div>
          </div>
          <div v-else :class="styles.empty">
            {{ t('chat.forward.noGroups') }}
          </div>
        </template>
      </div>
    </a-spin>
  </a-modal>
</template>
