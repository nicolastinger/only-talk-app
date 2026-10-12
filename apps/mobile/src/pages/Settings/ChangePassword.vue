<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { AuthFactorType, type AuthFactorVO } from "@workspace/types";
import {
  change_password,
  change_password_send_code,
  list_auth_factors,
} from "@workspace/services";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();

const loading = ref(false);
const emailFactor = ref<AuthFactorVO | null>(null);

const form = reactive({
  verificationCode: "",
  newPassword: "",
  confirmPassword: "",
});

const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

// 与后端 PASSWORD_REGEX 一致: 14 位以上的字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const maskedEmail = computed(() => {
  const value = emailFactor.value?.factor_value || "";
  const at = value.indexOf("@");
  if (at <= 1) return value;
  return `${value.slice(0, 2)}***${value.slice(at)}`;
});

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

const loadFactors = async () => {
  loading.value = true;
  try {
    const data = await list_auth_factors();
    emailFactor.value =
      data.list.find((f) => f.factor_type === AuthFactorType.EMAIL) ?? null;
  } catch (e) {
    console.log("加载二次认证因素失败", e);
  } finally {
    loading.value = false;
  }
};

const goBind = () => router.replace("/settings/auth-factor");

const onSendCode = async () => {
  if (!emailFactor.value) return;
  sending.value = true;
  try {
    await change_password_send_code({ factor_type: AuthFactorType.EMAIL });
    showToast({ message: t("settings.changePassword.codeSent"), icon: "success" });
    startCountdown();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.changePassword.sendFailed"),
      icon: "fail",
    });
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  if (!form.verificationCode.trim()) {
    showToast(t("settings.changePassword.emptyCode"));
    return;
  }
  if (!PASSWORD_REGEX.test(form.newPassword)) {
    showToast(t("settings.changePassword.invalidPassword"));
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast(t("settings.changePassword.passwordMismatch"));
    return;
  }
  submitting.value = true;
  try {
    await change_password({
      factor_type: AuthFactorType.EMAIL,
      verification_code: form.verificationCode.trim(),
      new_password: form.newPassword,
    });
    showToast({ message: t("settings.changePassword.success"), icon: "success" });
    form.verificationCode = "";
    form.newPassword = "";
    form.confirmPassword = "";
    router.back();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.changePassword.failed"),
      icon: "fail",
    });
  } finally {
    submitting.value = false;
  }
};

const goBack = () => router.back();

onMounted(loadFactors);
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="change-password-page">
    <van-nav-bar
      :title="t('settings.changePassword.title')"
      left-arrow
      @click-left="goBack"
    />

    <div v-if="!loading && !emailFactor" class="section-card empty-card">
      <p class="empty-text">{{ t("settings.changePassword.needBind") }}</p>
      <button class="primary-btn" @click="goBind">
        {{ t("settings.changePassword.goBind") }}
      </button>
    </div>

    <div v-else-if="emailFactor" class="section-card">
      <div class="section-title">
        {{ t("settings.changePassword.emailSection") }}
      </div>
      <div class="bound-row">
        <span class="bound-label">{{
          t("settings.changePassword.verifyBy")
        }}</span>
        <span class="bound-value">{{ maskedEmail }}</span>
      </div>

      <div class="form-body">
        <div class="code-row">
          <van-field
            v-model="form.verificationCode"
            type="digit"
            :label="t('settings.changePassword.codeLabel')"
            :placeholder="t('settings.changePassword.codePlaceholder')"
            maxlength="6"
          />
          <button
            class="code-btn"
            :disabled="sending || countdown > 0"
            @click="onSendCode"
          >
            {{
              countdown > 0
                ? `${countdown}s`
                : t("settings.changePassword.sendCode")
            }}
          </button>
        </div>
        <van-field
          v-model="form.newPassword"
          type="password"
          :label="t('settings.changePassword.newPasswordLabel')"
          :placeholder="t('settings.changePassword.newPasswordPlaceholder')"
          clearable
        />
        <van-field
          v-model="form.confirmPassword"
          type="password"
          :label="t('settings.changePassword.confirmPasswordLabel')"
          :placeholder="t('settings.changePassword.confirmPasswordPlaceholder')"
          clearable
        />
        <button class="primary-btn" :disabled="submitting" @click="onSubmit">
          {{ t("settings.changePassword.submit") }}
        </button>
      </div>
    </div>

    <p class="page-tip">{{ t("settings.changePassword.localTip") }}</p>
  </div>
</template>

<style scoped lang="less">
.change-password-page {
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

.section-title {
  padding: 14px 16px 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.bound-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}

.bound-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.bound-value {
  font-size: 14px;
  color: var(--text-primary);
}

.form-body {
  padding: 8px 0 16px;
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

.empty-card {
  padding: 24px 16px;
}

.empty-text {
  margin: 0 0 16px;
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-card .primary-btn {
  width: 100%;
  margin: 0;
}

.page-tip {
  margin: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
