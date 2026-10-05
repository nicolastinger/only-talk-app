<script setup lang="ts">
import { ref, watch } from "vue";
import { get_group_list, get_friend_list } from "@workspace/services";
import type { FriendVo, GroupListItemVo } from "@workspace/types";
import { DEFAULT_AVATAR } from "@/stores/user";
import { useAvatar } from "@/hooks/useAvatar";

const props = defineProps<{ show: boolean; count: number }>();
const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "confirm", payload: { recv: string; isGroup: boolean; name: string }): void;
}>();

const { getAvatarUrl } = useAvatar();

const activeTab = ref<"friend" | "group">("friend");
const friends = ref<FriendVo[]>([]);
const groups = ref<GroupListItemVo[]>([]);
const loading = ref(false);
const loaded = ref(false);
const selectedKey = ref("");
const avatarMap = ref<Record<string, string>>({});

const friendKey = (id: string) => `f:${id}`;
const groupKey = (id: string) => `g:${id}`;

const friendAvatar = (f: FriendVo) =>
  avatarMap.value[friendKey(f.friend_id)] || DEFAULT_AVATAR;
const groupAvatar = (g: GroupListItemVo) =>
  avatarMap.value[groupKey(g.group_uuid)] || DEFAULT_AVATAR;

const resolveAvatars = async () => {
  const targets: { key: string; icon?: string }[] = [
    ...friends.value.map((f) => ({ key: friendKey(f.friend_id), icon: f.friend_icon })),
    ...groups.value.map((g) => ({ key: groupKey(g.group_uuid), icon: g.avatar })),
  ];
  await Promise.all(
    targets.map(async ({ key, icon }) => {
      if (!icon) return;
      const url = await getAvatarUrl(icon);
      if (url) avatarMap.value = { ...avatarMap.value, [key]: url };
    })
  );
};

const loadTargets = async () => {
  if (loaded.value || loading.value) return;
  loading.value = true;
  try {
    const [f, g] = await Promise.all([
      get_friend_list().catch(() => [] as FriendVo[]),
      get_group_list().catch(() => [] as GroupListItemVo[]),
    ]);
    friends.value = f || [];
    groups.value = g || [];
    loaded.value = true;
    resolveAvatars();
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.show,
  (v) => {
    if (v) {
      selectedKey.value = "";
      loadTargets();
    }
  }
);

const close = () => emit("update:show", false);

const selectFriend = (f: FriendVo) => {
  selectedKey.value = `f:${f.friend_id}`;
};
const selectGroup = (g: GroupListItemVo) => {
  selectedKey.value = `g:${g.group_uuid}`;
};

const confirm = () => {
  if (!selectedKey.value) return;
  const [type, id] = selectedKey.value.split(":");
  if (type === "f") {
    const f = friends.value.find((x) => x.friend_id === id);
    emit("confirm", { recv: id, isGroup: false, name: f?.friend_name || id });
  } else {
    const g = groups.value.find((x) => x.group_uuid === id);
    emit("confirm", { recv: id, isGroup: true, name: g?.group_name || id });
  }
  close();
};
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="forward-picker"
    :style="{ height: '70%' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="fp-head">
      <button class="fp-cancel" @click="close">取消</button>
      <span class="fp-title">转发到</span>
      <button class="fp-confirm" :disabled="!selectedKey" @click="confirm">
        发送<i v-if="count"> {{ count }}</i>
      </button>
    </div>

    <div class="fp-tabs">
      <button
        class="fp-tab"
        :class="{ active: activeTab === 'friend' }"
        @click="activeTab = 'friend'"
      >
        好友
      </button>
      <button
        class="fp-tab"
        :class="{ active: activeTab === 'group' }"
        @click="activeTab = 'group'"
      >
        群聊
      </button>
    </div>

    <div class="fp-body">
      <div v-if="loading" class="fp-empty">加载中...</div>

      <template v-else-if="activeTab === 'friend'">
        <div
          v-for="f in friends"
          :key="f.friend_id"
          class="fp-item"
          @click="selectFriend(f)"
        >
          <img
            :src="friendAvatar(f)"
            class="fp-avatar"
            alt=""
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <span class="fp-name">{{ f.friend_name }}</span>
          <span
            class="fp-radio"
            :class="{ on: selectedKey === `f:${f.friend_id}` }"
          />
        </div>
        <div v-if="friends.length === 0" class="fp-empty">暂无好友</div>
      </template>

      <template v-else>
        <div
          v-for="g in groups"
          :key="g.group_uuid"
          class="fp-item"
          @click="selectGroup(g)"
        >
          <img
            :src="groupAvatar(g)"
            class="fp-avatar"
            alt=""
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <span class="fp-name">{{ g.group_name }}</span>
          <span
            class="fp-radio"
            :class="{ on: selectedKey === `g:${g.group_uuid}` }"
          />
        </div>
        <div v-if="groups.length === 0" class="fp-empty">暂无群聊</div>
      </template>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.forward-picker {
  display: flex;
  flex-direction: column;
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.fp-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.fp-cancel,
.fp-confirm {
  font-size: 14px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}
.fp-confirm {
  color: var(--brand-blue);
  font-weight: 600;
  &:disabled {
    color: var(--text-placeholder);
  }
}
.fp-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  flex-shrink: 0;
}
.fp-tab {
  flex: 1;
  padding: 8px 0;
  border-radius: 10px;
  border: 1px solid var(--border-medium);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  &.active {
    background: var(--gradient-primary);
    color: #fff;
    border-color: transparent;
  }
}
.fp-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 16px;
}
.fp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 10px;
  &:active {
    background: var(--surface-hover);
  }
}
.fp-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.fp-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-radio {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-medium);
  flex-shrink: 0;
  &.on {
    border-color: var(--brand-blue);
    background: var(--brand-blue);
    box-shadow: inset 0 0 0 3px #fff;
  }
}
.fp-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-placeholder);
  font-size: 13px;
}
</style>
