<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { AuthFactorType, type AuthFactorVO } from "@workspace/types";
import {
  create_auth_factor,
  delete_auth_factor,
  list_auth_factors,
  send_auth_factor_code,
} from "@workspace/services";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();

const loading = ref(false);
const emailFactor = ref<AuthFactorVO | null>(null);

const email = ref("");
const code = ref("");
const sending = ref(false);
const binding = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const unbindVisible = ref(false);
const unbindCode = ref("");
const unbindSending = ref(false);
const unbindConfirming = ref(false);
const unbindCountdown = ref(0);
let unbindTimer: ReturnType<typeof setInterval> | null = null;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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

const startUnbindCountdown = () => {
  unbindCountdown.value = 60;
  unbindTimer = setInterval(() => {
    unbindCountdown.value -= 1;
    if (unbindCountdown.value <= 0 && unbindTimer) {
      clearInterval(unbindTimer);
      unbindTimer = null;
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

const onSendCode = async () => {
  if (!EMAIL_REGEX.test(email.value.trim())) {
    showToast(t("settings.authFactor.invalidEmail"));
    return;
  }
  sending.value = true;
  try {
    await send_auth_factor_code({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
    });
    showToast({ message: t("settings.authFactor.codeSent"), icon: "success" });
    startCountdown();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.authFactor.sendFailed"),
      icon: "fail",
    });
  } finally {
    sending.value = false;
  }
};

const onBind = async () => {
  if (!EMAIL_REGEX.test(email.value.trim())) {
    showToast(t("settings.authFactor.invalidEmail"));
    return;
  }
  if (!code.value.trim()) {
    showToast(t("settings.authFactor.emptyCode"));
    return;
  }
  binding.value = true;
  try {
    await create_auth_factor({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
      verification_code: code.value.trim(),
    });
    showToast({ message: t("settings.authFactor.bindSuccess"), icon: "success" });
    email.value = "";
    code.value = "";
    await loadFactors();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.authFactor.bindFailed"),
      icon: "fail",
    });
  } finally {
    binding.value = false;
  }
};

const onUnbind = () => {
  if (!emailFactor.value) return;
  unbindCode.value = "";
  unbindCountdown.value = 0;
  unbindVisible.value = true;
};

const onSendUnbindCode = async () => {
  if (!emailFactor.value) return;
  unbindSending.value = true;
  try {
    await send_auth_factor_code({
      factor_type: AuthFactorType.EMAIL,
      scene: "unbind",
    });
    showToast({ message: t("settings.authFactor.codeSent"), icon: "success" });
    startUnbindCountdown();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.authFactor.sendFailed"),
      icon: "fail",
    });
  } finally {
    unbindSending.value = false;
  }
};

const onUnbindConfirm = async () => {
  if (!emailFactor.value) return;
  if (!unbindCode.value.trim()) {
    showToast(t("settings.authFactor.emptyCode"));
    return;
  }
  unbindConfirming.value = true;
  try {
    await delete_auth_factor({
      id: emailFactor.value.id,
      factor_type: AuthFactorType.EMAIL,
      verification_code: unbindCode.value.trim(),
    });
    showToast({
      message: t("settings.authFactor.unbindSuccess"),
      icon: "success",
    });
    unbindVisible.value = false;
    await loadFactors();
  } catch (e) {
    showToast({
      message: (e as Error).message || t("settings.authFactor.unbindFailed"),
      icon: "fail",
    });
  } finally {
    unbindConfirming.value = false;
  }
};

const goBack = () => router.back();

onMounted(loadFactors);
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (unbindTimer) clearInterval(unbindTimer);
});
</script>

<template>
  <div class="auth-factor-page">
    <van-nav-bar
      :title="t('settings.authFactor.title')"
      left-arrow
      @click-left="goBack"
    />

    <div class="section-card">
      <div class="section-title">{{ t("settings.authFactor.emailSection") }}</div>

      <div v-if="emailFactor" class="bound-card">
        <div class="bound-info">
          <span class="bound-value">{{ emailFactor.factor_value }}</span>
          <span class="bound-tag">{{ t("settings.authFactor.bound") }}</span>
        </div>
        <button class="unbind-btn" @click="onUnbind">
          {{ t("settings.authFactor.unbind") }}
        </button>
      </div>

      <div v-else class="bind-form">
        <van-field
          v-model="email"
          type="email"
          :label="t('settings.authFactor.emailLabel')"
          :placeholder="t('settings.authFactor.emailPlaceholder')"
          clearable
        />
        <div class="code-row">
          <van-field
            v-model="code"
            type="digit"
            :label="t('settings.authFactor.codeLabel')"
            :placeholder="t('settings.authFactor.codePlaceholder')"
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
                : t("settings.authFactor.sendCode")
            }}
          </button>
        </div>
        <button class="bind-btn" :disabled="binding" @click="onBind">
          {{ t("settings.authFactor.bind") }}
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">{{ t("settings.authFactor.otherSection") }}</div>
      <div class="disabled-row">
        <span class="disabled-name">{{ t("settings.authFactor.phone") }}</span>
        <span class="disabled-tag">{{
          t("settings.authFactor.comingSoon")
        }}</span>
      </div>
      <div class="disabled-row">
        <span class="disabled-name">{{ t("settings.authFactor.other") }}</span>
        <span class="disabled-tag">{{
          t("settings.authFactor.comingSoon")
        }}</span>
      </div>
    </div>

    <p class="page-tip">{{ t("settings.authFactor.tip") }}</p>

    <van-popup v-model:show="unbindVisible" position="bottom" round>
      <div class="unbind-sheet">
        <div class="unbind-sheet-title">
          {{ t("settings.authFactor.unbindConfirmTitle") }}
        </div>
        <div class="unbind-sheet-desc">
          {{
            t("settings.authFactor.unbindCodeDesc", {
              email: emailFactor?.factor_value,
            })
          }}
        </div>
        <div class="unbind-code-row">
          <van-field
            v-model="unbindCode"
            type="digit"
            :placeholder="t('settings.authFactor.codePlaceholder')"
            maxlength="6"
          />
          <button
            class="code-btn"
            :disabled="unbindSending || unbindCountdown > 0"
            @click="onSendUnbindCode"
          >
            {{
              unbindCountdown > 0
                ? `${unbindCountdown}s`
                : t("settings.authFactor.sendCode")
            }}
          </button>
        </div>
        <div class="unbind-actions">
          <button class="unbind-cancel" @click="unbindVisible = false">
            {{ t("common.cancel") }}
          </button>
          <button
            class="unbind-confirm"
            :disabled="unbindConfirming"
            @click="onUnbindConfirm"
          >
            {{ t("settings.authFactor.confirmUnbind") }}
          </button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped lang="less">
.auth-factor-page {
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

.bound-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
}

.bound-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.bound-value {
  font-size: 15px;
  color: var(--text-primary);
  word-break: break-all;
}

.bound-tag {
  align-self: flex-start;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--brand-blue);
  background: rgba(74, 144, 255, 0.1);
  border-radius: 10px;
}

.unbind-btn {
  flex-shrink: 0;
  height: 34px;
  padding: 0 16px;
  background: var(--surface);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  color: var(--color-error);
  font-size: 14px;
  cursor: pointer;

  &:active {
    background: rgba(239, 68, 68, 0.06);
  }
}

.bind-form {
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

.bind-btn {
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

.disabled-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.disabled-name {
  font-size: 15px;
  color: var(--text-tertiary);
}

.disabled-tag {
  font-size: 12px;
  color: var(--text-placeholder);
}

.page-tip {
  margin: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
  line-height: 1.6;
}

.unbind-sheet {
  padding: 20px 16px 24px;
}

.unbind-sheet-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.unbind-sheet-desc {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  word-break: break-all;
}

.unbind-code-row {
  display: flex;
  align-items: center;
  margin-top: 16px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;

  :deep(.van-field) {
    flex: 1;
    padding-left: 12px;
  }
}

.unbind-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.unbind-cancel,
.unbind-confirm {
  flex: 1;
  height: 44px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.unbind-cancel {
  background: var(--surface);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);
}

.unbind-confirm {
  background: var(--color-error);
  border: none;
  color: #fff;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
