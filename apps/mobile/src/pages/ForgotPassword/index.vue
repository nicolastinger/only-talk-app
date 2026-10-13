<script setup lang="ts">
import { onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { AuthFactorType } from "@workspace/types";
import {
  forgot_password_reset,
  forgot_password_send_code,
} from "@workspace/services";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();

const form = reactive({
  account: "",
  email: "",
  verificationCode: "",
  newPassword: "",
  confirmPassword: "",
});

const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 一致: 14 位以上的字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const startCountdown = () => {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
};

const onSendCode = async () => {
  const account = form.account.trim();
  const email = form.email.trim();
  if (!account) {
    showToast(t("forgotPassword.accountRequired"));
    return;
  }
  if (account.length < 5) {
    showToast(t("forgotPassword.accountTooShort"));
    return;
  }
  if (!email) {
    showToast(t("forgotPassword.emailRequired"));
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    showToast(t("forgotPassword.emailInvalid"));
    return;
  }
  sending.value = true;
  try {
    await forgot_password_send_code({
      account,
      factor_type: AuthFactorType.EMAIL,
      factor_value: email,
    });
    showToast({ message: t("forgotPassword.codeSent"), icon: "success" });
    startCountdown();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("forgotPassword.sendFailed"),
      icon: "fail",
    });
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  const account = form.account.trim();
  const email = form.email.trim();
  if (!account) {
    showToast(t("forgotPassword.accountRequired"));
    return;
  }
  if (account.length < 5) {
    showToast(t("forgotPassword.accountTooShort"));
    return;
  }
  if (!email) {
    showToast(t("forgotPassword.emailRequired"));
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    showToast(t("forgotPassword.emailInvalid"));
    return;
  }
  if (!form.verificationCode.trim()) {
    showToast(t("forgotPassword.codeRequired"));
    return;
  }
  if (!/^\d{6}$/.test(form.verificationCode.trim())) {
    showToast(t("forgotPassword.codeInvalid"));
    return;
  }
  if (!PASSWORD_REGEX.test(form.newPassword)) {
    showToast(t("forgotPassword.passwordInvalid"));
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast(t("forgotPassword.passwordMismatch"));
    return;
  }
  submitting.value = true;
  try {
    await forgot_password_reset({
      account,
      factor_type: AuthFactorType.EMAIL,
      factor_value: email,
      verification_code: form.verificationCode.trim(),
      new_password: form.newPassword,
    });
    showToast({ message: t("forgotPassword.success"), icon: "success" });
    router.replace("/login");
  } catch (e) {
    showToast({
      message: (e as Error).message || t("forgotPassword.failed"),
      icon: "fail",
    });
  } finally {
    submitting.value = false;
  }
};

const goBack = () => router.back();

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="forgot-password-page">
    <van-nav-bar
      :title="t('forgotPassword.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="section-card">
      <p class="page-subtitle">{{ t("forgotPassword.subtitle") }}</p>
      <div class="form-body">
        <van-field
          v-model="form.account"
          type="text"
          :label="t('forgotPassword.accountLabel')"
          :placeholder="t('forgotPassword.accountPlaceholder')"
          clearable
        />
        <p class="field-hint">{{ t("forgotPassword.accountHint") }}</p>

        <van-field
          v-model="form.email"
          type="email"
          :label="t('forgotPassword.emailLabel')"
          :placeholder="t('forgotPassword.emailPlaceholder')"
          clearable
        />
        <p class="field-hint">{{ t("forgotPassword.emailHint") }}</p>

        <div class="code-row">
          <van-field
            v-model="form.verificationCode"
            type="digit"
            :label="t('forgotPassword.codeLabel')"
            :placeholder="t('forgotPassword.codePlaceholder')"
            maxlength="6"
          />
          <button
            class="code-btn"
            :disabled="sending || countdown > 0"
            @click="onSendCode"
          >
            {{
              countdown > 0
                ? t("forgotPassword.resend", { seconds: countdown })
                : t("forgotPassword.sendCode")
            }}
          </button>
        </div>
        <p class="field-hint">{{ t("forgotPassword.codeHint") }}</p>

        <van-field
          v-model="form.newPassword"
          type="password"
          :label="t('forgotPassword.newPasswordLabel')"
          :placeholder="t('forgotPassword.newPasswordPlaceholder')"
          clearable
        />
        <van-field
          v-model="form.confirmPassword"
          type="password"
          :label="t('forgotPassword.confirmPasswordLabel')"
          :placeholder="t('forgotPassword.confirmPasswordPlaceholder')"
          clearable
        />

        <button class="primary-btn" :disabled="submitting" @click="onSubmit">
          {{ t("forgotPassword.submit") }}
        </button>
      </div>
    </div>

    <p class="page-tip">
      <a class="back-link" @click="goBack">{{
        t("forgotPassword.backToLogin")
      }}</a>
    </p>
  </div>
</template>

<style scoped lang="less">
.forgot-password-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.page-subtitle {
  margin: 0;
  padding: 14px 16px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.form-body {
  padding: 8px 0 16px;
}

.field-hint {
  margin: 6px 16px 0;
  font-size: 12px;
  color: var(--text-placeholder);
}

.code-row {
  display: flex;
  align-items: center;

  :deep(.van-field) {
    flex: 1;
  }
}

.code-btn {
  flex-shrink: 0;
  margin-right: 16px;
  height: 34px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--brand-blue);
  border-radius: var(--radius-sm);
  color: var(--brand-blue);
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.primary-btn {
  width: calc(100% - 32px);
  margin: 16px 16px 0;
  height: 44px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.99);
  }
}

.page-tip {
  margin: 16px;
  text-align: center;
  font-size: 13px;
}

.back-link {
  color: var(--brand-blue);
  cursor: pointer;

  &:active {
    opacity: 0.7;
  }
}
</style>
