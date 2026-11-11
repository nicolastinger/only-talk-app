<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CloseOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { Window } from '@tauri-apps/api/window';
import {
  forgot_password_reset,
  forgot_password_send_code,
} from '@workspace/services';
import { AuthFactorType } from '@workspace/types';
import LanguageSwitcher from '@/components/LanguageSwitch/index.vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from './index.module.less';

const { t: translate } = useI18n();
const router = useRouter();

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 一致: 14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const account = ref('');
const email = ref('');
const verificationCode = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const accountError = ref('');
const emailError = ref('');
const codeError = ref('');
const passwordError = ref('');
const confirmError = ref('');
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const timerRef = ref<ReturnType<typeof setInterval> | null>(null);

const t = (id: string, values?: Record<string, string | number>) =>
  translate(`forgotPassword.${id}`, values);

onUnmounted(() => {
  if (timerRef.value) clearInterval(timerRef.value);
});

const startCountdown = (seconds: number) => {
  countdown.value = seconds;
  timerRef.value = setInterval(() => {
    if (countdown.value <= 1) {
      if (timerRef.value) clearInterval(timerRef.value);
      countdown.value = 0;
      return;
    }
    countdown.value -= 1;
  }, 1000);
};

const validateEmail = (value: string): boolean => {
  if (!value) {
    emailError.value = t('emailRequired');
    return false;
  }
  if (!EMAIL_REGEX.test(value)) {
    emailError.value = t('emailInvalid');
    return false;
  }
  emailError.value = '';
  return true;
};

const validateAccount = (value: string): boolean => {
  if (!value) {
    accountError.value = t('accountRequired');
    return false;
  }
  if (value.length < 5) {
    accountError.value = t('accountTooShort');
    return false;
  }
  accountError.value = '';
  return true;
};

const validateCode = (value: string): boolean => {
  if (!value) {
    codeError.value = t('codeRequired');
    return false;
  }
  if (!/^\d{6}$/.test(value)) {
    codeError.value = t('codeInvalid');
    return false;
  }
  codeError.value = '';
  return true;
};

const validatePassword = (value: string): boolean => {
  if (!PASSWORD_REGEX.test(value)) {
    passwordError.value = t('passwordInvalid');
    return false;
  }
  passwordError.value = '';
  return true;
};

const validateConfirm = (value: string): boolean => {
  if (value !== newPassword.value) {
    confirmError.value = t('passwordMismatch');
    return false;
  }
  confirmError.value = '';
  return true;
};

const handleSendCode = async () => {
  const isAccountValid = validateAccount(account.value);
  const isEmailValid = validateEmail(email.value);
  if (!isAccountValid || !isEmailValid) return;
  sending.value = true;
  try {
    await forgot_password_send_code({
      account: account.value.trim(),
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
    });
    feedback.message.success(t('codeSent'));
    startCountdown(60);
  } catch (e) {
    feedback.message.error((e as Error).message || t('sendFailed'));
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  const isAccountValid = validateAccount(account.value);
  const isEmailValid = validateEmail(email.value);
  const isCodeValid = validateCode(verificationCode.value);
  const isPasswordValid = validatePassword(newPassword.value);
  const isConfirmValid = validateConfirm(confirmPassword.value);
  if (
    !isAccountValid ||
    !isEmailValid ||
    !isCodeValid ||
    !isPasswordValid ||
    !isConfirmValid
  ) {
    return;
  }
  submitting.value = true;
  try {
    await forgot_password_reset({
      account: account.value.trim(),
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
      verification_code: verificationCode.value.trim(),
      new_password: newPassword.value,
    });
    feedback.message.success(t('success'));
    router.push('/signIn');
  } catch (e) {
    feedback.message.error((e as Error).message || t('failed'));
  } finally {
    submitting.value = false;
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') onSubmit();
};

const closeWindow = async () => {
  await Window.getCurrent().close();
};

const goToSignIn = () => {
  router.push('/signIn');
};

const onAccountInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  account.value = value;
  if (accountError.value) validateAccount(value);
};

const onEmailInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  email.value = value;
  if (emailError.value) validateEmail(value);
};

const onCodeInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  verificationCode.value = value;
  if (codeError.value) validateCode(value);
};

const onPasswordInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  newPassword.value = value;
  if (passwordError.value) validatePassword(value);
};

const onConfirmInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  confirmPassword.value = value;
  if (confirmError.value) validateConfirm(value);
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.titleBar">
      <div :class="styles.logo">
        <span :class="styles.appName">Only Talk</span>
      </div>
      <div :class="styles.windowControls">
        <LanguageSwitcher />
        <div :class="styles.closeBtn" @click="closeWindow">
          <CloseOutlined />
        </div>
      </div>
    </div>

    <div :class="styles.content" @keydown="handleKeyDown">
      <div :class="styles.avatarSection">
        <div :class="styles.welcomeText">{{ t('title') }}</div>
      </div>

      <div :class="styles.formSection">
        <div :class="styles.formInner">
          <div :class="styles.inputWrapper">
            <div
              :class="[
                styles.inputGroup,
                accountError ? styles.inputError : '',
              ]"
            >
              <UserOutlined :class="styles.inputIcon" />
              <input
                type="text"
                :class="styles.input"
                :placeholder="t('accountPlaceholder')"
                :value="account"
                @input="onAccountInput"
                @blur="validateAccount(account)"
              />
            </div>
            <span v-if="!accountError" :class="styles.hintText">
              {{ t('accountHint') }}
            </span>
            <span v-else :class="styles.errorText">{{ accountError }}</span>
          </div>

          <div :class="styles.inputWrapper">
            <div
              :class="[styles.inputGroup, emailError ? styles.inputError : '']"
            >
              <MailOutlined :class="styles.inputIcon" />
              <input
                type="email"
                :class="styles.input"
                :placeholder="t('emailPlaceholder')"
                :value="email"
                @input="onEmailInput"
                @blur="validateEmail(email)"
              />
            </div>
            <span v-if="!emailError" :class="styles.hintText">
              {{ t('emailHint') }}
            </span>
            <span v-else :class="styles.errorText">{{ emailError }}</span>
          </div>

          <div :class="styles.inputWrapper">
            <div
              :class="[
                styles.inputGroup,
                styles.inputGroupCode,
                codeError ? styles.inputError : '',
              ]"
            >
              <SafetyCertificateOutlined :class="styles.inputIcon" />
              <input
                type="text"
                :class="styles.input"
                :placeholder="t('codePlaceholder')"
                :value="verificationCode"
                @input="onCodeInput"
                @blur="validateCode(verificationCode)"
              />
              <button
                type="button"
                :class="styles.codeBtn"
                :disabled="sending || countdown > 0"
                @click="handleSendCode"
              >
                {{
                  countdown > 0
                    ? t('resend', { seconds: countdown })
                    : t('sendCode')
                }}
              </button>
            </div>
            <span v-if="!codeError" :class="styles.hintText">
              {{ t('codeHint') }}
            </span>
            <span v-else :class="styles.errorText">{{ codeError }}</span>
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
                :type="showPassword ? 'text' : 'password'"
                :class="styles.input"
                :placeholder="t('newPasswordPlaceholder')"
                :value="newPassword"
                @input="onPasswordInput"
                @blur="validatePassword(newPassword)"
              />
              <span
                :class="styles.passwordToggle"
                @click="showPassword = !showPassword"
              >
                <EyeInvisibleOutlined v-if="showPassword" />
                <EyeOutlined v-else />
              </span>
            </div>
            <span v-if="passwordError" :class="styles.errorText">
              {{ passwordError }}
            </span>
          </div>

          <div :class="styles.inputWrapper">
            <div
              :class="[
                styles.inputGroup,
                confirmError ? styles.inputError : '',
              ]"
            >
              <LockOutlined :class="styles.inputIcon" />
              <input
                :type="showPassword ? 'text' : 'password'"
                :class="styles.input"
                :placeholder="t('confirmPasswordPlaceholder')"
                :value="confirmPassword"
                @input="onConfirmInput"
                @blur="validateConfirm(confirmPassword)"
              />
            </div>
            <span v-if="confirmError" :class="styles.errorText">
              {{ confirmError }}
            </span>
          </div>

          <button
            type="button"
            :class="styles.submitBtn"
            :disabled="submitting"
            @click="onSubmit"
          >
            <span v-if="submitting" :class="styles.loadingDot">...</span>
            <template v-else>{{ t('submit') }}</template>
          </button>
        </div>
      </div>

      <div :class="styles.footerLinks">
        <a :class="styles.link" @click.prevent="goToSignIn">
          {{ t('backToLogin') }}
        </a>
      </div>
    </div>
  </div>
</template>
