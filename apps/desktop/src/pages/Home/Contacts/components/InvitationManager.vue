<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ClearOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons-vue';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import {
  accept_group_invitation,
  clearUnreadByLevel,
  decline_group_invitation,
  get_pending_invitations,
  get_sent_invitations,
  getUnreadNotificationCounts,
  readContactsNotification,
} from '@workspace/services';
import type { GroupInvitationVo } from '@workspace/types';
import styles from './styles/InvitationManager.module.less';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{ (e: 'cancel'): void }>();

const { t } = useI18n();
const store = useBearStore();

const receivedList = ref<GroupInvitationVo[]>([]);
const sentList = ref<GroupInvitationVo[]>([]);

const getStatusConfig = (status: number) => {
  const statusMap: Record<number, { text: string; color: string }> = {
    1: {
      text: t('contacts.invitation.statusPending'),
      color: 'processing',
    },
    2: {
      text: t('contacts.invitation.statusAccepted'),
      color: 'success',
    },
    3: {
      text: t('contacts.invitation.statusRejected'),
      color: 'error',
    },
  };
  return (
    statusMap[status] || {
      text: t('contacts.invitation.statusUnknown'),
      color: 'default',
    }
  );
};

const formatTime = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(
    2,
    '0',
  )}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const refreshUnreadCounts = async () => {
  try {
    const counts = await getUnreadNotificationCounts();
    const current = store.menuUnread;
    store.setMenuUnread({
      ...current,
      contacts: counts.contacts,
      groups: counts.groups,
      plaza: counts.plaza,
      moments: counts.moments,
      total: counts.contacts + counts.groups + counts.plaza + counts.moments,
    });
  } catch (e) {
    console.log('刷新未读通知数量失败', e);
  }
};

const loadAll = async () => {
  try {
    const [received, sent] = await Promise.all([
      get_pending_invitations(),
      get_sent_invitations(),
    ]);
    receivedList.value = received || [];
    sentList.value = sent || [];
  } catch (err) {
    console.error('获取邀请列表失败', err);
    feedback.message.error(t('contacts.invitation.fetchError'));
  }
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadAll();
    }
  },
);

const handleClearUnread = async () => {
  await clearUnreadByLevel(1, 3, 1, -1);
  refreshUnreadCounts();
  feedback.message.success(t('contacts.invitation.clearUnreadSuccess'));
};

const handleAccept = async (groupUuid: string) => {
  try {
    const ok = await accept_group_invitation(groupUuid);
    if (ok) {
      feedback.message.success(t('contacts.invitation.acceptSuccess'));
      await readContactsNotification([groupUuid]);
      refreshUnreadCounts();
      loadAll();
    } else {
      feedback.message.warning(t('contacts.invitation.acceptFailed'));
    }
  } catch (err) {
    feedback.message.error(t('contacts.invitation.acceptFailed'));
  }
};

const handleDecline = async (groupUuid: string) => {
  try {
    const ok = await decline_group_invitation(groupUuid);
    if (ok) {
      feedback.message.success(t('contacts.invitation.rejectSuccess'));
      await readContactsNotification([groupUuid]);
      refreshUnreadCounts();
      loadAll();
    } else {
      feedback.message.warning(t('contacts.invitation.rejectFailed'));
    }
  } catch (err) {
    feedback.message.error(t('contacts.invitation.rejectFailed'));
  }
};

const pendingCount = computed(
  () => receivedList.value.filter((i) => i.status === 1).length,
);
</script>

<template>
  <a-modal
    :open="visible"
    :closable="false"
    :footer="null"
    :width="520"
    @cancel="emit('cancel')"
  >
    <template #title>
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span>{{ t('contacts.invitation.modalTitle') }}</span>
        <a-popconfirm
          :title="t('contacts.invitation.clearUnreadConfirm')"
          :ok-text="t('contacts.invitation.confirm')"
          :cancel-text="t('contacts.invitation.cancel')"
          @confirm="handleClearUnread"
        >
          <a-button type="text" size="small">
            <template #icon><ClearOutlined /></template>
            {{ t('contacts.invitation.clearUnread') }}
          </a-button>
        </a-popconfirm>
      </div>
    </template>

    <a-tabs>
      <a-tab-pane key="received">
        <template #tab>
          <span :class="styles.tabLabel">
            <span>{{ t('contacts.invitation.tabReceived') }}</span>
            <span v-if="pendingCount > 0" :class="styles.badge">
              {{ pendingCount > 99 ? '99+' : pendingCount }}
            </span>
          </span>
        </template>

        <div v-if="receivedList.length > 0" :class="styles['invitation-list']">
          <div
            v-for="inv in receivedList"
            :key="inv.id"
            :class="styles['invitation-item']"
          >
            <div :class="styles['invitation-left']">
              <div
                :class="[
                  styles['invitation-avatar'],
                  styles['avatar-received'],
                ]"
              >
                <UserSwitchOutlined />
              </div>
            </div>
            <div :class="styles['invitation-info']">
              <div :class="styles['invitation-group']">
                {{ inv.group_name }}
              </div>
              <div :class="styles['invitation-meta']">
                <span>
                  <TeamOutlined style="margin-right: 4px; font-size: 11px" />
                  {{ inv.inviter_uuid.slice(0, 8) }}...
                </span>
                <span>{{ formatTime(inv.created_at) }}</span>
              </div>
            </div>
            <div :class="styles['invitation-actions']">
              <template v-if="inv.status === 1">
                <a-button
                  type="primary"
                  size="small"
                  @click="handleAccept(inv.group_uuid)"
                >
                  {{ t('contacts.invitation.accept') }}
                </a-button>
                <a-button
                  size="small"
                  danger
                  @click="handleDecline(inv.group_uuid)"
                >
                  {{ t('contacts.invitation.reject') }}
                </a-button>
              </template>
              <a-tag v-else :color="getStatusConfig(inv.status).color">
                {{ getStatusConfig(inv.status).text }}
              </a-tag>
            </div>
          </div>
        </div>
        <a-empty v-else :description="t('contacts.invitation.noReceived')" />
      </a-tab-pane>

      <a-tab-pane key="sent">
        <template #tab>
          <span>{{ t('contacts.invitation.tabSent') }}</span>
        </template>

        <div v-if="sentList.length > 0" :class="styles['invitation-list']">
          <div
            v-for="inv in sentList"
            :key="inv.id"
            :class="styles['invitation-item']"
          >
            <div :class="styles['invitation-left']">
              <div
                :class="[styles['invitation-avatar'], styles['avatar-sent']]"
              >
                <TeamOutlined />
              </div>
            </div>
            <div :class="styles['invitation-info']">
              <div :class="styles['invitation-group']">
                {{ inv.group_name }}
              </div>
              <div :class="styles['invitation-meta']">
                <span>
                  <UserSwitchOutlined
                    style="margin-right: 4px; font-size: 11px"
                  />
                  {{ inv.invitee_uuid.slice(0, 8) }}...
                </span>
                <span>{{ formatTime(inv.created_at) }}</span>
              </div>
            </div>
            <div :class="styles['invitation-actions']">
              <a-tag :color="getStatusConfig(inv.status).color">
                {{ getStatusConfig(inv.status).text }}
              </a-tag>
            </div>
          </div>
        </div>
        <a-empty v-else :description="t('contacts.invitation.noSent')" />
      </a-tab-pane>
    </a-tabs>
  </a-modal>
</template>
