<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CloseOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GithubOutlined,
  LeftOutlined,
  LockOutlined,
  RightOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import type { WebviewOptions } from '@tauri-apps/api/webview';
import { Window } from '@tauri-apps/api/window';
import LanguageSwitcher from '@/components/LanguageSwitch/index.vue';
import LocalImage from '@/components/LocalImage/index.vue';
import LoginSettingsModal from '@/components/LoginSettingsModal/index.vue';
import { openNewWindow } from '@/components/Window/OpenWindow';
import {
  getApiBase,
  getFiles,
  isBackendSuccess,
  openExternalUrl,
} from '@workspace/services';
import { PRIVACY_POLICY_URL } from '@workspace/types';
import type { HttpResponse, ResponseData } from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from './index.module.less';

interface QuickLoginUser {
  user_id: string;
  username: string | null;
  account: string | null;
  icon: string | null;
  refresh_token: string | null;
  updated_at: number | null;
}

const { t } = useI18n();
const router = useRouter();

const userCode = ref('');
const password = ref('');
const passwordVisible = ref(false);
const agreed = ref(false);
const loading = ref(false);
const githubLoading = ref(false);
const userCodeError = ref('');
const passwordError = ref('');
const avatarUrl = ref('');

const quickUsers = ref<QuickLoginUser[]>([]);
const currentUserIndex = ref(0);
const quickLoginLoading = ref(false);
const showQuickLogin = ref(true);
const settingsOpen = ref(false);

const loadUserAvatar = async (user: QuickLoginUser) => {
  if (user.icon) {
    try {
      const fileVos = await getFiles(user.icon);
      if (fileVos && fileVos.length > 0 && fileVos[0].tauri_file_path) {
        avatarUrl.value = fileVos[0].tauri_file_path;
        return;
      }
    } catch {
      /* ignore */
    }
  }
  avatarUrl.value = '';
};

const loadQuickUsers = async () => {
  try {
    const users: QuickLoginUser[] = await invoke('get_quick_login_users');
    quickUsers.value = users;
    if (users.length > 0) {
      showQuickLogin.value = true;
      loadUserAvatar(users[0]);
    }
  } catch (err) {
    console.log('加载免登录用户失败', err);
  }
};

onMounted(() => {
  loadQuickUsers();
});

const handlePrevUser = () => {
  if (quickUsers.value.length <= 1) return;
  const newIndex =
    (currentUserIndex.value - 1 + quickUsers.value.length) %
    quickUsers.value.length;
  currentUserIndex.value = newIndex;
  loadUserAvatar(quickUsers.value[newIndex]);
};

const handleNextUser = () => {
  if (quickUsers.value.length <= 1) return;
  const newIndex = (currentUserIndex.value + 1) % quickUsers.value.length;
  currentUserIndex.value = newIndex;
  loadUserAvatar(quickUsers.value[newIndex]);
};

const handleDeleteUser = async (e: MouseEvent) => {
  e.stopPropagation();
  const user = quickUsers.value[currentUserIndex.value];
  if (!user?.user_id) return;

  try {
    await invoke('delete_quick_login_user', { userId: user.user_id });
    const newUsers = quickUsers.value.filter(
      (_, idx) => idx !== currentUserIndex.value,
    );
    quickUsers.value = newUsers;

    if (newUsers.length === 0) {
      showQuickLogin.value = false;
      avatarUrl.value = '';
    } else {
      const newIndex =
        currentUserIndex.value >= newUsers.length ? 0 : currentUserIndex.value;
      currentUserIndex.value = newIndex;
      loadUserAvatar(newUsers[newIndex]);
    }
    feedback.message.success('已删除');
  } catch (err) {
    console.log(err);
    feedback.message.error('删除失败');
  }
};

const handleQuickLogin = async () => {
  const user = quickUsers.value[currentUserIndex.value];
  if (!user?.refresh_token) return;

  quickLoginLoading.value = true;
  try {
    const response: HttpResponse = await invoke('quick_login', {
      refreshToken: user.refresh_token,
      url: getApiBase(),
    });

    const data: ResponseData = JSON.parse(response.body);
    if (isBackendSuccess(data.code)) {
      feedback.message.success(t('signIn.success'));
      const webviewOptions: WebviewOptions = {
        url: '/home/chats',
        height: 600,
        width: 800,
        x: 200,
        y: 200,
      };
      await openNewWindow(
        'home',
        webviewOptions,
        Window.getCurrent(),
        'Only Talk',
      );
    } else {
      feedback.message.error('免登录失败，请手动登录');
      showQuickLogin.value = false;
    }
  } catch (error) {
    console.log(error);
    feedback.message.error('免登录失败，请手动登录');
    showQuickLogin.value = false;
  } finally {
    quickLoginLoading.value = false;
  }
};

const closeWindow = async () => {
  const currentWindow = Window.getCurrent();
  await currentWindow.close();
};

const goToSignUp = async () => {
  router.push('/signUp');
};

const goToForgotPassword = () => {
  router.push('/forgotPassword');
};

const validateUserCode = (value: string): boolean => {
  if (!value) {
    userCodeError.value = t('signIn.errors.usernameRequired');
    return false;
  }
  if (value.length < 5) {
    userCodeError.value = t('signIn.errors.usernameTooShort');
    return false;
  }
  userCodeError.value = '';
  return true;
};

const validatePassword = (value: string): boolean => {
  if (!value) {
    passwordError.value = t('signIn.errors.passwordRequired');
    return false;
  }
  if (value.length < 8) {
    passwordError.value = t('signIn.errors.passwordTooShort');
    return false;
  }
  passwordError.value = '';
  return true;
};

const loadAvatarByAccount = (account: string) => {
  if (!account) {
    avatarUrl.value = '';
    return;
  }
  const matchedUser = quickUsers.value.find(
    (user) => user.account === account || user.username === account,
  );
  if (matchedUser) {
    loadUserAvatar(matchedUser);
  } else {
    avatarUrl.value = '';
  }
};

const handleUserCodeChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  userCode.value = value;
  if (userCodeError.value) {
    validateUserCode(value);
  }
  loadAvatarByAccount(value);
};

const handlePasswordChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  password.value = value;
  if (passwordError.value) {
    validatePassword(value);
  }
};

const fetchData = async (account: string, pwd: string) => {
  loading.value = true;
  try {
    const response: HttpResponse = await invoke('sign_in', {
      url: getApiBase() + '/user/sign_in',
      body: { account, password: pwd, platform: 'PC' },
    });

    const data: ResponseData = JSON.parse(response.body);
    if (isBackendSuccess(data.code)) {
      feedback.message.success(t('signIn.success'));
      const webviewOptions: WebviewOptions = {
        url: '/home/chats',
        height: 600,
        width: 800,
        x: 200,
        y: 200,
      };
      await openNewWindow(
        'home',
        webviewOptions,
        Window.getCurrent(),
        'Only Talk',
      );
    } else {
      feedback.message.error(t('signIn.errors.invalidCredentials'));
    }
  } catch (error: unknown) {
    if (error !== null && error !== undefined && typeof error === 'string') {
      try {
        const result = JSON.parse(error);
        if (result.code === 500) {
          feedback.message.error(t('signIn.errors.invalidCredentials'));
        }
      } catch {
        feedback.message.error(t('signIn.errors.networkError'));
      }
    } else {
      feedback.message.error(t('signIn.errors.networkError'));
    }
  } finally {
    loading.value = false;
  }
};

const onFinish = () => {
  const isUserCodeValid = validateUserCode(userCode.value);
  const isPasswordValid = validatePassword(password.value);
  if (!isUserCodeValid || !isPasswordValid) return;
  if (!agreed.value) {
    feedback.message.warning(t('signIn.errors.pleaseAgree'));
    return;
  }
  fetchData(userCode.value, password.value);
};

const handleGithubLogin = async () => {
  if (!agreed.value) {
    feedback.message.warning(t('signIn.errors.pleaseAgree'));
    return;
  }
  githubLoading.value = true;
  try {
    const response: HttpResponse = await invoke('github_login', {
      url: getApiBase(),
    });

    const data: ResponseData = JSON.parse(response.body);
    if (isBackendSuccess(data.code)) {
      feedback.message.success(t('signIn.success'));
      const webviewOptions: WebviewOptions = {
        url: '/home/chats',
        height: 600,
        width: 800,
        x: 200,
        y: 200,
      };
      await openNewWindow(
        'home',
        webviewOptions,
        Window.getCurrent(),
        'Only Talk',
      );
    } else {
      feedback.message.error(t('signIn.errors.invalidCredentials'));
    }
  } catch (error: unknown) {
    if (error !== null && error !== undefined && typeof error === 'string') {
      try {
        const result = JSON.parse(error);
        if (result.message) {
          feedback.message.error(result.message);
        } else if (result.code === 500) {
          feedback.message.error(t('signIn.errors.invalidCredentials'));
        }
      } catch {
        feedback.message.error(error);
      }
    } else {
      feedback.message.error(t('signIn.errors.networkError'));
    }
  } finally {
    githubLoading.value = false;
  }
};

/** 打开官网隐私协议页面 */
const openPrivacyModal = (e?: Event) => {
  e?.preventDefault();
  e?.stopPropagation();
  openExternalUrl(PRIVACY_POLICY_URL).catch((err) =>
    console.error('打开隐私协议失败:', err),
  );
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    onFinish();
  }
};

const currentUser = computed(() => quickUsers.value[currentUserIndex.value]);
const hasQuickUsers = computed(() => quickUsers.value.length > 0);

const showPasswordLogin = () => {
  avatarUrl.value = '';
  showQuickLogin.value = false;
};

const showQuickLoginPanel = () => {
  showQuickLogin.value = true;
  loadUserAvatar(quickUsers.value[currentUserIndex.value]);
};
</script>

<template>
  <div :class="styles.container">
    <LoginSettingsModal :open="settingsOpen" @close="settingsOpen = false" />
    <div :class="styles.titleBar">
      <div :class="styles.logo">
        <span :class="styles.appName">Only Talk</span>
      </div>
      <div :class="styles.windowControls">
        <div
          :class="styles.settingsBtn"
          title="设置"
          @click="settingsOpen = true"
        >
          <SettingOutlined />
        </div>
        <LanguageSwitcher />
        <div :class="styles.closeBtn" @click="closeWindow">
          <CloseOutlined />
        </div>
      </div>
    </div>

    <div :class="styles.content" @keydown="handleKeyDown">
      <div
        v-if="showQuickLogin && hasQuickUsers"
        :class="styles.quickLoginSection"
      >
        <div :class="styles.quickLoginAvatar">
          <div
            v-if="quickUsers.length > 1"
            :class="styles.switchBtn"
            @click="handlePrevUser"
          >
            <LeftOutlined />
          </div>
          <div :class="styles.avatarContainer">
            <div :class="styles.avatarWrapper">
              <a-avatar v-if="avatarUrl" :src="avatarUrl" :size="80" />
              <LocalImage v-else :width="80" :height="80" />
            </div>
            <div :class="styles.deleteBtn" @click="handleDeleteUser">
              <DeleteOutlined />
            </div>
          </div>
          <div
            v-if="quickUsers.length > 1"
            :class="styles.switchBtn"
            @click="handleNextUser"
          >
            <RightOutlined />
          </div>
        </div>
        <div :class="styles.quickLoginName">
          {{ currentUser?.username || currentUser?.account || '用户' }}
        </div>
        <div v-if="quickUsers.length > 1" :class="styles.userIndicator">
          <span
            v-for="(_, idx) in quickUsers"
            :key="idx"
            :class="[
              styles.dot,
              idx === currentUserIndex ? styles.dotActive : '',
            ]"
            @click="
              () => {
                currentUserIndex = idx;
                loadUserAvatar(quickUsers[idx]);
              }
            "
          />
        </div>
        <button
          type="button"
          :class="styles.loginBtn"
          :disabled="quickLoginLoading"
          @click="handleQuickLogin"
        >
          <span v-if="quickLoginLoading" :class="styles.loadingDot">...</span>
          <template v-else>一键登录</template>
        </button>
        <a :class="styles.switchToPassword" @click.prevent="showPasswordLogin">
          使用密码登录
        </a>
      </div>

      <div v-else :class="styles.passwordLoginSection">
        <div :class="styles.avatarSection">
          <div :class="styles.avatarWrapper">
            <a-avatar v-if="avatarUrl" :src="avatarUrl" :size="80" />
            <LocalImage v-else :width="80" :height="80" />
          </div>
          <div :class="styles.welcomeText">{{ t('signIn.welcome') }}</div>
        </div>

        <div :class="styles.formSection">
          <div :class="styles.inputWrapper">
            <div
              :class="[
                styles.inputGroup,
                userCodeError ? styles.inputError : '',
              ]"
            >
              <UserOutlined :class="styles.inputIcon" />
              <input
                type="text"
                :class="styles.input"
                :placeholder="t('signIn.username')"
                :value="userCode"
                @input="handleUserCodeChange"
              />
            </div>
            <span v-if="userCodeError" :class="styles.errorText">
              {{ userCodeError }}
            </span>
          </div>

          <div :class="styles.inputWrapper">
            <div
              :class="[
                styles.inputGroup,
                passwordError ? styles.inputError : '',
              ]"
            >
              <LockOutlined :class="styles.inputIcon" />
              <input
                :type="passwordVisible ? 'text' : 'password'"
                :class="styles.input"
                :placeholder="t('signIn.password')"
                :value="password"
                @input="handlePasswordChange"
                @blur="validatePassword(password)"
              />
              <span
                :class="styles.eyeIcon"
                @click="passwordVisible = !passwordVisible"
              >
                <EyeInvisibleOutlined v-if="passwordVisible" />
                <EyeOutlined v-else />
              </span>
            </div>
            <span v-if="passwordError" :class="styles.errorText">
              {{ passwordError }}
            </span>
          </div>

          <div :class="styles.options">
            <a-checkbox v-model:checked="agreed" :class="styles.checkbox">
              {{ t('signIn.agreement') }}
              <a :class="styles.link" @click.prevent="openPrivacyModal($event)">
                {{ t('signIn.privacyPolicy') }}
              </a>
            </a-checkbox>
          </div>

          <button
            type="button"
            :class="styles.loginBtn"
            :disabled="loading"
            @click="onFinish"
          >
            <span v-if="loading" :class="styles.loadingDot">...</span>
            <template v-else>{{ t('signIn.submit') }}</template>
          </button>

          <button
            type="button"
            :class="styles.githubBtn"
            :disabled="githubLoading"
            @click="handleGithubLogin"
          >
            <GithubOutlined :class="styles.githubIcon" />
            <span v-if="githubLoading" :class="styles.loadingDot">...</span>
            <template v-else>使用 GitHub 登录</template>
          </button>

          <div :class="styles.footerLinks">
            <template v-if="hasQuickUsers">
              <a :class="styles.link" @click.prevent="showQuickLoginPanel">
                免登录
              </a>
              <span :class="styles.divider">|</span>
            </template>
            <a :class="styles.link" @click.prevent="goToForgotPassword">
              {{ t('signIn.forgotPassword') }}
            </a>
            <span :class="styles.divider">|</span>
            <a :class="styles.link" @click.prevent="goToSignUp">
              {{ t('signUp.title') }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
