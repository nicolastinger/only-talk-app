<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import {
  complete_profile,
  isHttpSuccess,
  send_verify_code,
  sign_up_step1,
} from '@workspace/services';
import type {
  CompleteProfileRequest,
  RustResponse,
  SignUpStep1Request,
} from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../index.module.less';

const { t } = useI18n();

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 保持一致:14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const step = ref(1);
const loading = ref(false);
const account = ref('');
const username = ref('');
const password = ref('');
const email = ref('');
const verificationCode = ref('');
const regToken = ref('');
const showPassword = ref(false);
const accountError = ref('');
const usernameError = ref('');
const passwordError = ref('');
const emailError = ref('');
const codeError = ref('');
const countdown = ref(0);
const timerRef = ref<ReturnType<typeof setInterval> | null>(null);

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

const validateAccount = (value: string): boolean => {
  if (!value) {
    accountError.value = t('signUp.accountRequired');
    return false;
  }
  if (value.length < 5) {
    accountError.value = t('signUp.accountMinLength');
    return false;
  }
  accountError.value = '';
  return true;
};

const validateUsername = (value: string): boolean => {
  if (!value) {
    usernameError.value = t('signUp.usernameRequired');
    return false;
  }
  usernameError.value = '';
  return true;
};

const validatePassword = (value: string): boolean => {
  if (!value) {
    passwordError.value = t('signUp.passwordRequired');
    return false;
  }
  if (!PASSWORD_REGEX.test(value)) {
    passwordError.value = t('signUp.passwordPattern');
    return false;
  }
  passwordError.value = '';
  return true;
};

const validateEmail = (value: string): boolean => {
  if (!value) {
    emailError.value = t('signUp.emailRequired');
    return false;
  }
  if (!EMAIL_REGEX.test(value)) {
    emailError.value = t('signUp.emailPattern');
    return false;
  }
  emailError.value = '';
  return true;
};

const validateCode = (value: string): boolean => {
  if (!value) {
    codeError.value = t('signUp.codeRequired');
    return false;
  }
  if (!/^\d{6}$/.test(value)) {
    codeError.value = t('signUp.codePattern');
    return false;
  }
  codeError.value = '';
  return true;
};

const handleAccountChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  account.value = value;
  if (accountError.value) validateAccount(value);
};

const handleUsernameChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  username.value = value;
  if (usernameError.value) validateUsername(value);
};

const handlePasswordChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  password.value = value;
  if (passwordError.value) validatePassword(value);
};

const handleEmailChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  email.value = value;
  if (emailError.value) validateEmail(value);
};

const handleCodeChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  verificationCode.value = value;
  if (codeError.value) validateCode(value);
};

/** 判断是否为注册会话 token 失效(过期/不存在), 需回退第一步重新获取验证码 */
const isTokenExpired = (res: RustResponse): boolean => {
  try {
    const body = JSON.parse(res.res.body);
    if (body && typeof body.message === 'string') {
      return body.message.includes('失效') || body.message.includes('不存在');
    }
  } catch {
    /* 非 JSON 响应时按非 token 失效处理 */
  }
  return false;
};

const handleSendCode = async () => {
  if (!validateEmail(email.value)) return;
  loading.value = true;
  try {
    const res = await send_verify_code({ email: email.value });
    if (res.netSuccess && isHttpSuccess(res.res.status)) {
      feedback.message.success(t('signUp.sendCodeSuccess'));
      startCountdown(60);
    }
    // 失败时由 httpService 中间层统一展示(604 逐条/500 业务信息)
  } catch {
    feedback.message.error(t('signUp.sendCodeFail'));
  } finally {
    loading.value = false;
  }
};

const handleNext = async () => {
  const isEmailValid = validateEmail(email.value);
  const isCodeValid = validateCode(verificationCode.value);

  if (!isEmailValid || !isCodeValid) {
    return;
  }

  loading.value = true;

  try {
    const step1Request: SignUpStep1Request = {
      email: email.value,
      verification_code: verificationCode.value,
    };
    const res = await sign_up_step1(step1Request);
    if (res.netSuccess && isHttpSuccess(res.res.status)) {
      let token = '';
      try {
        const body = JSON.parse(res.res.body);
        token = body?.data?.reg_token ?? '';
      } catch {
        /* 响应非预期 JSON 时按失败处理 */
      }
      if (!token) {
        feedback.message.error(t('signUp.failed'));
        return;
      }
      regToken.value = token;
      step.value = 2;
    }
    // 失败时由 httpService 中间层统一展示(604 逐条/500 业务信息)
  } catch {
    feedback.message.error(t('signUp.failed'));
  } finally {
    loading.value = false;
  }
};

const handlePrev = () => {
  step.value = 1;
};

const onFinish = async () => {
  const isAccountValid = validateAccount(account.value);
  const isUsernameValid = validateUsername(username.value);
  const isPasswordValid = validatePassword(password.value);

  if (!isAccountValid || !isUsernameValid || !isPasswordValid) {
    return;
  }

  loading.value = true;

  try {
    const completeProfileRequest: CompleteProfileRequest = {
      reg_token: regToken.value,
      email: email.value,
      account: account.value,
      password: password.value,
      username: username.value,
    };
    const res = await complete_profile(completeProfileRequest);
    if (res.netSuccess && isHttpSuccess(res.res.status)) {
      feedback.message.success(
        t('signUp.success', { username: username.value }),
      );
    } else if (isTokenExpired(res)) {
      // 会话失效: 错误信息已由中间层展示, 这里仅回退到第一步重新获取验证码
      step.value = 1;
    }
    // 其余失败由 httpService 中间层统一展示(604 逐条/500 业务信息)
  } catch (error) {
    feedback.message.error(t('signUp.failed'));
  } finally {
    loading.value = false;
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    if (step.value === 1) {
      handleNext();
    } else {
      onFinish();
    }
  }
};
</script>

<template>
  <div :class="styles.formInner" @keydown="handleKeyDown">
    <template v-if="step === 1">
      <div :class="styles.inputWrapper">
        <div :class="[styles.inputGroup, emailError ? styles.inputError : '']">
          <MailOutlined :class="styles.inputIcon" />
          <input
            type="email"
            :class="styles.input"
            :placeholder="t('signUp.emailPlaceholder')"
            :value="email"
            @input="handleEmailChange"
            @blur="validateEmail(email)"
          />
        </div>
        <span v-if="!emailError" :class="styles.hintText">
          {{ t('signUp.emailHint') }}
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
            :placeholder="t('signUp.codePlaceholder')"
            :value="verificationCode"
            @input="handleCodeChange"
            @blur="validateCode(verificationCode)"
          />
          <button
            type="button"
            :class="styles.codeBtn"
            :disabled="loading || countdown > 0"
            @click="handleSendCode"
          >
            {{
              countdown > 0
                ? t('signUp.resend', { seconds: countdown })
                : t('signUp.sendCode')
            }}
          </button>
        </div>
        <span v-if="!codeError" :class="styles.hintText">
          {{ t('signUp.codeHint') }}
        </span>
        <span v-else :class="styles.errorText">{{ codeError }}</span>
      </div>

      <button
        type="button"
        :class="styles.submitBtn"
        :disabled="loading"
        @click="handleNext"
      >
        <span v-if="loading" :class="styles.loadingDot">...</span>
        <template v-else>{{ t('signUp.next') }}</template>
      </button>
    </template>

    <template v-else>
      <div :class="styles.inputWrapper">
        <span :class="styles.stepEmailLabel">
          {{ t('signUp.registerEmail') }}
        </span>
        <div :class="styles.stepEmail">{{ email }}</div>
      </div>

      <div :class="styles.inputWrapper">
        <div
          :class="[styles.inputGroup, accountError ? styles.inputError : '']"
        >
          <UserOutlined :class="styles.inputIcon" />
          <input
            type="text"
            :class="styles.input"
            :placeholder="t('signUp.accountPlaceholder')"
            :value="account"
            @input="handleAccountChange"
            @blur="validateAccount(account)"
          />
        </div>
        <span v-if="!accountError" :class="styles.hintText">
          {{ t('signUp.accountHint') }}
        </span>
        <span v-else :class="styles.errorText">{{ accountError }}</span>
      </div>

      <div :class="styles.inputWrapper">
        <div
          :class="[styles.inputGroup, usernameError ? styles.inputError : '']"
        >
          <SmileOutlined :class="styles.inputIcon" />
          <input
            type="text"
            :class="styles.input"
            :placeholder="t('signUp.usernamePlaceholder')"
            :value="username"
            @input="handleUsernameChange"
            @blur="validateUsername(username)"
          />
        </div>
        <span v-if="!usernameError" :class="styles.hintText">
          {{ t('signUp.usernameHint') }}
        </span>
        <span v-else :class="styles.errorText">{{ usernameError }}</span>
      </div>

      <div :class="styles.inputWrapper">
        <div
          :class="[styles.inputGroup, passwordError ? styles.inputError : '']"
        >
          <LockOutlined :class="styles.inputIcon" />
          <input
            :type="showPassword ? 'text' : 'password'"
            :class="styles.input"
            :placeholder="t('signUp.passwordPlaceholder')"
            :value="password"
            @input="handlePasswordChange"
            @blur="validatePassword(password)"
          />
          <span
            :class="styles.passwordToggle"
            @click="showPassword = !showPassword"
          >
            <EyeInvisibleOutlined v-if="showPassword" />
            <EyeOutlined v-else />
          </span>
        </div>
        <span v-if="!passwordError" :class="styles.hintText">
          {{ t('signUp.passwordHint') }}
        </span>
        <span v-else :class="styles.errorText">{{ passwordError }}</span>
      </div>

      <div :class="styles.btnRow">
        <button
          type="button"
          :class="styles.prevBtn"
          :disabled="loading"
          @click="handlePrev"
        >
          {{ t('signUp.prev') }}
        </button>
        <button
          type="button"
          :class="styles.submitBtn"
          :disabled="loading"
          @click="onFinish"
        >
          <span v-if="loading" :class="styles.loadingDot">...</span>
          <template v-else>{{ t('signUp.submit') }}</template>
        </button>
      </div>
    </template>
  </div>
</template>
