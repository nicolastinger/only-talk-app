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

const router = useRouter();

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
    showToast({ message: "验证码已发送", icon: "success" });
    startCountdown();
  } catch (e) {
    showToast({ message: (e as Error).message || "发送失败", icon: "fail" });
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  if (!form.verificationCode.trim()) {
    showToast("请输入验证码");
    return;
  }
  if (!PASSWORD_REGEX.test(form.newPassword)) {
    showToast("密码必须为14位以上的字母或数字");
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast("两次输入的密码不一致");
    return;
  }
  submitting.value = true;
  try {
    await change_password({
      factor_type: AuthFactorType.EMAIL,
      verification_code: form.verificationCode.trim(),
      new_password: form.newPassword,
    });
    showToast({ message: "密码修改成功", icon: "success" });
    form.verificationCode = "";
    form.newPassword = "";
    form.confirmPassword = "";
    router.back();
  } catch (e) {
    showToast({ message: (e as Error).message || "修改失败", icon: "fail" });
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
    <van-nav-bar title="修改密码" left-arrow @click-left="goBack" />

    <div v-if="!loading && !emailFactor" class="section-card empty-card">
      <p class="empty-text">修改密码需要先绑定邮箱二次认证。</p>
      <button class="primary-btn" @click="goBind">去绑定邮箱二次认证</button>
    </div>

    <div v-else-if="emailFactor" class="section-card">
      <div class="section-title">邮箱验证</div>
      <div class="bound-row">
        <span class="bound-label">验证方式</span>
        <span class="bound-value">{{ maskedEmail }}</span>
      </div>

      <div class="form-body">
        <div class="code-row">
          <van-field
            v-model="form.verificationCode"
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
        <van-field
          v-model="form.newPassword"
          type="password"
          label="新密码"
          placeholder="14位以上的字母或数字"
          clearable
        />
        <van-field
          v-model="form.confirmPassword"
          type="password"
          label="确认密码"
          placeholder="请再次输入新密码"
          clearable
        />
        <button class="primary-btn" :disabled="submitting" @click="onSubmit">
          确认修改
        </button>
      </div>
    </div>

    <p class="page-tip">验证码将发送至已绑定的邮箱，5 分钟内有效。</p>
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
