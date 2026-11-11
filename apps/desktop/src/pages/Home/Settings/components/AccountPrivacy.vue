<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  LockOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/stores/app';
import { calcAgeFromBirthday } from '@/utils/format';
import { getFiles } from '@workspace/services';
import { useI18n } from '@/i18n';
import styles from '../Settings.module.less';
import ChangePasswordModal from './ChangePasswordModal.vue';

const { t } = useI18n();
const router = useRouter();
const store = useBearStore();

const userInfo = computed(() => store.userInfo);
const avatarUrl = ref('');
const changePwdOpen = ref(false);

const loadAvatar = async (icon: string) => {
  try {
    if (!icon) {
      avatarUrl.value = '';
      return;
    }
    const FileVos = await getFiles(icon);
    avatarUrl.value = FileVos?.[0]?.tauri_file_path || '';
  } catch (error) {
    console.log(error);
    avatarUrl.value = '';
  }
};

onMounted(() => {
  loadAvatar(userInfo.value?.icon || '');
});

watch(
  () => userInfo.value?.icon,
  (icon) => {
    loadAvatar(icon || '');
  },
);

const formatBirthday = (timestamp?: number) => {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('zh-CN');
};

const genderLabel = (gender?: number) => {
  if (gender === 2) return t('settings.accountPrivacy.male');
  if (gender === 3) return t('settings.accountPrivacy.female');
  return '-';
};

const ageText = computed(
  () => calcAgeFromBirthday(userInfo.value?.birthday) ?? '-',
);

const maskedPhone = computed(() => {
  const phone = userInfo.value?.phone;
  if (!phone) return '-';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
});

const onAvatarError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};

const goBlacklist = () => {
  router.push('/home/settings?tab=blacklist');
};

const goAuthFactor = () => {
  router.push('/home/settings?tab=authFactor');
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.accountPrivacy.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <UserOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.accountPrivacy.accountInfo') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div :class="styles.profileHeader">
        <img
          :class="styles.profileAvatar"
          :src="avatarUrl || DEFAULT_ICON"
          alt="avatar"
          @error="onAvatarError"
        />
        <div :class="styles.profileIdentity">
          <div :class="styles.profileName">
            {{ userInfo?.username || '-' }}
            <UserTypeTag :type="userInfo?.user_type" />
          </div>
          <div :class="styles.profileAccount">
            {{ userInfo?.account || '-' }}
          </div>
        </div>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.phoneNumber') }}
        </span>
        <span :class="styles.accountValue">{{ maskedPhone }}</span>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.email') }}
        </span>
        <span :class="styles.accountValue">{{ userInfo?.email || '-' }}</span>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.bio') }}
        </span>
        <span :class="styles.accountValue">{{ userInfo?.info || '-' }}</span>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.gender') }}
        </span>
        <span :class="styles.accountValue">
          {{ genderLabel(userInfo?.gender) }}
        </span>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.age') }}
        </span>
        <span :class="styles.accountValue">{{ ageText }}</span>
      </div>
      <div :class="styles.accountInfo">
        <span :class="styles.accountLabel">
          {{ t('settings.accountPrivacy.birthday') }}
        </span>
        <span :class="styles.accountValue">
          {{ formatBirthday(userInfo?.birthday) }}
        </span>
      </div>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <UserOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.accountPrivacy.privacySettings') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-checkbox default-checked :class="styles.settingCheckbox">
        {{ t('settings.accountPrivacy.allowSearchByPhone') }}
      </a-checkbox>
      <a-checkbox default-checked :class="styles.settingCheckbox">
        {{ t('settings.accountPrivacy.allowRecommend') }}
      </a-checkbox>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.accountPrivacy.privacyDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <StopOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.accountPrivacy.blacklist') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-button @click="goBlacklist">
        {{ t('settings.accountPrivacy.manageBlacklist') }}
      </a-button>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.accountPrivacy.blacklistDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <LockOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.accountPrivacy.securitySettings') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-button type="primary" @click="changePwdOpen = true">
        {{ t('settings.accountPrivacy.changePassword') }}
      </a-button>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.accountPrivacy.securityDesc') }}
      </a-typography-text>
    </a-card>

    <ChangePasswordModal
      :open="changePwdOpen"
      @close="changePwdOpen = false"
      @go-bind="goAuthFactor"
    />
  </div>
</template>
