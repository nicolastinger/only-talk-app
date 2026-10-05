<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showConfirmDialog, showToast } from "vant";
import { AuthFactorType, type AuthFactorVO } from "@workspace/types";
import {
  create_auth_factor,
  delete_auth_factor,
  list_auth_factors,
  send_auth_factor_code,
} from "@workspace/services";

const router = useRouter();

const loading = ref(false);
const emailFactor = ref<AuthFactorVO | null>(null);

const email = ref("");
const code = ref("");
const sending = ref(false);
const binding = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

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
    showToast("请输入正确的邮箱");
    return;
  }
  sending.value = true;
  try {
    await send_auth_factor_code({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
    });
    showToast({ message: "验证码已发送", icon: "success" });
    startCountdown();
  } catch (e) {
    showToast({ message: (e as Error).message || "发送失败", icon: "fail" });
  } finally {
    sending.value = false;
  }
};

const onBind = async () => {
  if (!EMAIL_REGEX.test(email.value.trim())) {
    showToast("请输入正确的邮箱");
    return;
  }
  if (!code.value.trim()) {
    showToast("请输入验证码");
    return;
  }
  binding.value = true;
  try {
    await create_auth_factor({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
      verification_code: code.value.trim(),
    });
    showToast({ message: "绑定成功", icon: "success" });
    email.value = "";
    code.value = "";
    await loadFactors();
  } catch (e) {
    showToast({ message: (e as Error).message || "绑定失败", icon: "fail" });
  } finally {
    binding.value = false;
  }
};

const onUnbind = async () => {
  if (!emailFactor.value) return;
  const current = emailFactor.value;
  try {
    await showConfirmDialog({
      title: "解绑二次认证",
      message: `确定解绑邮箱 ${current.factor_value} 吗？`,
      confirmButtonText: "解绑",
      cancelButtonText: "取消",
      confirmButtonColor: "#ef4444",
    });
  } catch {
    return;
  }
  try {
    await delete_auth_factor(current.id);
    showToast({ message: "已解绑", icon: "success" });
    await loadFactors();
  } catch (e) {
    showToast({ message: (e as Error).message || "解绑失败", icon: "fail" });
  }
};

const goBack = () => router.back();

onMounted(loadFactors);
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="auth-factor-page">
    <van-nav-bar title="二次认证" left-arrow @click-left="goBack" />

    <div class="section-card">
      <div class="section-title">邮箱认证</div>

      <div v-if="emailFactor" class="bound-card">
        <div class="bound-info">
          <span class="bound-value">{{ emailFactor.factor_value }}</span>
          <span class="bound-tag">已绑定</span>
        </div>
        <button class="unbind-btn" @click="onUnbind">解绑</button>
      </div>

      <div v-else class="bind-form">
        <van-field
          v-model="email"
          type="email"
          label="邮箱"
          placeholder="请输入邮箱"
          clearable
        />
        <div class="code-row">
          <van-field
            v-model="code"
            type="digit"
            label="验证码"
            placeholder="请输入验证码"
            maxlength="6"
          />
          <button
            class="code-btn"
            :disabled="sending || countdown > 0"
            @click="onSendCode"
          >
            {{ countdown > 0 ? `${countdown}s` : "获取验证码" }}
          </button>
        </div>
        <button class="bind-btn" :disabled="binding" @click="onBind">
          绑定
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">其他渠道</div>
      <div class="disabled-row">
        <span class="disabled-name">手机号认证</span>
        <span class="disabled-tag">敬请期待</span>
      </div>
      <div class="disabled-row">
        <span class="disabled-name">其他认证</span>
        <span class="disabled-tag">敬请期待</span>
      </div>
    </div>

    <p class="page-tip">
      绑定二次认证后，可用于账号安全校验。当前仅开放邮箱渠道。
    </p>
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
</style>
