<script setup lang="ts">
/**
 * 聊天页「好友设置」抽屉：聊天背景、消息免打扰、屏蔽好友、举报。
 *
 * - 聊天背景：好友专属背景（未设置时回退全局背景），复用 chatBackground 服务，
 *   变更后会广播 `chat-background-changed`，已打开的聊天页即时刷新。
 * - 消息免打扰：后端暂无按好友静音的接口，先保留开关并提示"开发中"。
 * - 屏蔽好友：走 block/unblock 接口，成功后通知父组件刷新会话。
 * - 举报：打开 ReportModal。
 */
import { computed, ref, watch } from 'vue';
import { WarningOutlined } from '@ant-design/icons-vue';
import ReportModal from '@/components/ReportModal/index.vue';
import {
  block_friend,
  clearFriendChatBackground,
  getFriendChatBackground,
  importFriendChatBackground,
  pickChatBackgroundImage,
  resolveChatBackgroundUrl,
  unblock_friend,
} from '@workspace/services';
import type { FriendChatBackgroundVo } from '@workspace/services';
import { ReportTargetType, type FriendVo } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './styles/FriendSettingsPanel.module.less';

const props = defineProps<{
  open: boolean;
  friendInfo?: FriendVo;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  /** 屏蔽/取消屏蔽成功，父组件据此刷新会话列表与好友信息 */
  (e: 'changed'): void;
}>();

const { t } = useI18n();

const friendId = computed(() => props.friendInfo?.friend_id || '');
const friendName = computed(
  () => props.friendInfo?.friend_name || friendId.value,
);
/** 屏蔽状态本地维护一份：聊天页不会因为 store.triggerRefresh 重新拉取好友信息，需乐观更新 */
const isBlocked = ref(props.friendInfo?.is_block === 1);
watch(
  () => props.friendInfo?.is_block,
  (value) => {
    isBlocked.value = value === 1;
  },
);
const isMuted = computed(() => props.friendInfo?.is_mute === 1);

const background = ref<FriendChatBackgroundVo | null>(null);
const backgroundUploading = ref(false);
const backgroundPreview = computed(() =>
  background.value
    ? resolveChatBackgroundUrl(background.value.file_path)
    : '',
);
const reportOpen = ref(false);

const loadBackground = async () => {
  if (!friendId.value) {
    background.value = null;
    return;
  }
  try {
    background.value = await getFriendChatBackground(friendId.value);
  } catch {
    background.value = null;
  }
};

watch(
  () => [props.open, friendId.value],
  ([open]) => {
    if (open) void loadBackground();
  },
  { immediate: true },
);

const handlePickBackground = async () => {
  if (!friendId.value || backgroundUploading.value) return;
  const path = await pickChatBackgroundImage();
  if (!path) return;
  backgroundUploading.value = true;
  try {
    background.value = await importFriendChatBackground(friendId.value, path);
    feedback.message.success(t('friendInfo.chatBackgroundApplied'));
  } catch (e) {
    console.error('设置好友聊天背景失败', e);
    feedback.message.error(t('friendInfo.chatBackgroundFailed'));
  } finally {
    backgroundUploading.value = false;
  }
};

const handleResetBackground = async () => {
  if (!friendId.value) return;
  try {
    await clearFriendChatBackground(friendId.value);
    background.value = null;
    feedback.message.success(t('friendInfo.chatBackgroundApplied'));
  } catch (e) {
    console.error('恢复全局聊天背景失败', e);
    feedback.message.error(t('friendInfo.chatBackgroundFailed'));
  }
};

const handleMuteChange = () => {
  // 后端暂未提供按好友静音接口，保持与原下拉项一致的提示
  feedback.message.info(t('chat.topBar.muteDeveloping'));
};

const handleBlockChange = () => {
  if (!friendId.value) return;
  if (isBlocked.value) {
    void doUnblock();
    return;
  }
  feedback.modal.confirm({
    title: t('chat.topBar.confirmBlock'),
    content: t('chat.topBar.confirmBlockMsg', { name: friendName.value }),
    okText: t('chat.topBar.confirm'),
    okButtonProps: { danger: true },
    cancelText: t('chat.topBar.cancel'),
    onOk: () => doBlock(),
  });
};

const doBlock = async () => {
  try {
    await block_friend(friendId.value);
    isBlocked.value = true;
    feedback.message.success(t('chat.topBar.blockedSuccess'));
    emit('changed');
  } catch (e) {
    console.error('屏蔽好友失败:', e);
    feedback.message.error(t('chat.topBar.blockedFailed'));
  }
};

const doUnblock = async () => {
  try {
    await unblock_friend(friendId.value);
    isBlocked.value = false;
    feedback.message.success(t('chat.topBar.unblockedSuccess'));
    emit('changed');
  } catch (e) {
    console.error('取消屏蔽失败:', e);
    feedback.message.error(t('chat.topBar.unblockedFailed'));
  }
};
</script>

<template>
  <a-drawer
    :open="open"
    :title="t('chat.friendSettings')"
    placement="right"
    :width="360"
    @close="emit('update:open', false)"
  >
    <div :class="styles.section">
      <div :class="styles.sectionTitle">
        {{ t('friendInfo.chatBackground') }}
      </div>
      <div :class="styles.backgroundRow">
        <div
          :class="[styles.backgroundPreview, backgroundPreview ? styles.hasImage : '']"
          :style="
            backgroundPreview
              ? { backgroundImage: `url('${backgroundPreview}')` }
              : undefined
          "
        />
        <div :class="styles.backgroundActions">
          <a-button
            size="small"
            type="primary"
            :loading="backgroundUploading"
            @click="handlePickBackground"
          >
            {{ t('friendInfo.chatBackgroundUpload') }}
          </a-button>
          <a-button
            size="small"
            :disabled="!backgroundPreview || backgroundUploading"
            @click="handleResetBackground"
          >
            {{ t('friendInfo.chatBackgroundReset') }}
          </a-button>
        </div>
      </div>
      <div :class="styles.hint">{{ t('friendInfo.chatBackgroundHint') }}</div>
    </div>

    <div :class="styles.section">
      <div :class="styles.row">
        <div :class="styles.rowText">
          <div :class="styles.rowTitle">
            {{ t('chat.topBar.muteNotifications') }}
          </div>
        </div>
        <a-switch
          :checked="isMuted"
          :aria-label="t('chat.topBar.muteNotifications')"
          @change="handleMuteChange"
        />
      </div>

      <div :class="styles.row">
        <div :class="styles.rowText">
          <div :class="styles.rowTitle">
            {{
              isBlocked
                ? t('chat.topBar.unblockFriend')
                : t('chat.topBar.blockFriend')
            }}
          </div>
          <div :class="styles.hint">{{ t('chat.topBar.blockWarning') }}</div>
        </div>
        <a-switch
          :checked="isBlocked"
          :aria-label="
            isBlocked
              ? t('chat.topBar.unblockFriend')
              : t('chat.topBar.blockFriend')
          "
          @change="handleBlockChange"
        />
      </div>

      <div :class="styles.row">
        <div :class="styles.rowText">
          <div :class="styles.rowTitle">{{ t('report.action') }}</div>
        </div>
        <a-button size="small" @click="reportOpen = true">
          <template #icon><WarningOutlined /></template>
          {{ t('report.action') }}
        </a-button>
      </div>
    </div>

    <ReportModal
      v-if="friendId"
      :open="reportOpen"
      :target-type="ReportTargetType.USER"
      :target-uuid="friendId"
      :target-name="friendName"
      @close="reportOpen = false"
    />
  </a-drawer>
</template>
