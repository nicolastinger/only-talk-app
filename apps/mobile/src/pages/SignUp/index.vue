<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import type { RustResponse } from "@workspace/types";
import {
  send_verify_code,
  sign_up_step1,
  complete_profile,
} from "@workspace/services";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 保持一致:14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const router = useRouter();

const step = ref<1 | 2>(1);
const loading = ref(false);
const sendingCode = ref(false);
const countdown = ref(0);
let timer: number | undefined;

const email = ref("");
const verificationCode = ref("");
const account = ref("");
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const regToken = ref("");

const emailError = ref("");
const codeError = ref("");
const accountError = ref("");
const usernameError = ref("");
const passwordError = ref("");

const validateEmail = (): boolean => {
  if (!email.value) {
    emailError.value = "请输入邮箱";
    return false;
  }
  if (!EMAIL_REGEX.test(email.value)) {
    emailError.value = "邮箱格式不正确";
    return false;
  }
  emailError.value = "";
  return true;
};

const validateCode = (): boolean => {
  if (!verificationCode.value) {
    codeError.value = "请输入验证码";
    return false;
  }
  if (!/^\d{6}$/.test(verificationCode.value)) {
    codeError.value = "验证码必须为6位数字";
    return false;
  }
  codeError.value = "";
  return true;
};

const validateAccount = (): boolean => {
  if (!account.value) {
    accountError.value = "请输入账号";
    return false;
  }
  if (account.value.length < 5) {
    accountError.value = "账号长度至少5位";
    return false;
  }
  accountError.value = "";
  return true;
};

const validateUsername = (): boolean => {
  if (!username.value) {
    usernameError.value = "请输入昵称";
    return false;
  }
  usernameError.value = "";
  return true;
};

const validatePassword = (): boolean => {
  if (!password.value) {
    passwordError.value = "请输入密码";
    return false;
  }
  if (!PASSWORD_REGEX.test(password.value)) {
    passwordError.value = "密码必须为14位以上的字母或数字";
    return false;
  }
  passwordError.value = "";
  return true;
};

const startCountdown = (seconds: number) => {
  countdown.value = seconds;
  if (timer) clearInterval(timer);
  timer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
  }, 1000);
};

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

/** 提取后端返回的具体错误信息 */
const getBackendMessage = (res: RustResponse, fallback: string): string => {
  try {
    const body = JSON.parse(res.res.body);
    if (body && typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    /* 非 JSON 响应时使用默认文案 */
  }
  return fallback;
};

/** 判断是否为注册会话 token 失效(过期/不存在), 需回退第一步重新获取验证码 */
const isTokenExpired = (res: RustResponse): boolean => {
  try {
    const body = JSON.parse(res.res.body);
    if (body && typeof body.message === "string") {
      return body.message.includes("失效") || body.message.includes("不存在");
    }
  } catch {
    /* 非 JSON 响应时按非 token 失效处理 */
  }
  return false;
};

const handleSendCode = async () => {
  if (!validateEmail()) return;
  sendingCode.value = true;
  try {
    const res = await send_verify_code({ email: email.value });
    if (res.netSuccess && res.res.status === 200) {
      showToast({ message: "验证码已发送，请注意查收", icon: "success" });
      startCountdown(60);
    } else {
      showToast(getBackendMessage(res, "验证码发送失败，请稍后重试"));
    }
  } catch {
    showToast("验证码发送失败，请稍后重试");
  } finally {
    sendingCode.value = false;
  }
};

const handleNext = async () => {
  const isEmailValid = validateEmail();
  const isCodeValid = validateCode();
  if (!isEmailValid || !isCodeValid) return;

  loading.value = true;
  try {
    const res = await sign_up_step1({
      email: email.value,
      verification_code: verificationCode.value,
    });
    if (res.netSuccess && res.res.status === 200) {
      let token = "";
      try {
        token = JSON.parse(res.res.body)?.data?.reg_token ?? "";
      } catch {
        /* 响应非预期 JSON 时按失败处理 */
      }
      if (!token) {
        showToast("注册失败");
        return;
      }
      regToken.value = token;
      step.value = 2;
    } else {
      showToast(getBackendMessage(res, "注册失败"));
    }
  } catch {
    showToast("注册失败");
  } finally {
    loading.value = false;
  }
};

const handlePrev = () => {
  step.value = 1;
};

const onFinish = async () => {
  const isAccountValid = validateAccount();
  const isUsernameValid = validateUsername();
  const isPasswordValid = validatePassword();
  if (!isAccountValid || !isUsernameValid || !isPasswordValid) return;

  loading.value = true;
  try {
    const res = await complete_profile({
      reg_token: regToken.value,
      email: email.value,
      account: account.value,
      password: password.value,
      username: username.value,
    });
    if (res.netSuccess && res.res.status === 200) {
      showToast({
        message: `注册成功，欢迎 ${username.value}!`,
        icon: "success",
      });
      router.replace("/login");
    } else if (isTokenExpired(res)) {
      showToast("注册会话已过期，请返回上一步重新获取验证码");
      step.value = 1;
    } else {
      showToast(getBackendMessage(res, "注册失败"));
    }
  } catch {
    showToast("注册失败");
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  if (window.history.state && window.history.state.back) {
    router.back();
  } else {
    router.replace("/login");
  }
};

const goLogin = () => {
  router.replace("/login");
};
</script>

<template>
  <div class="signup-page">
    <div class="signup-bg">
      <div class="bg-blob bg-blob-1"></div>
      <div class="bg-blob bg-blob-2"></div>
      <div class="bg-blob bg-blob-3"></div>
    </div>

    <div class="signup-header">
      <button class="back-btn" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>
      <h1 class="header-title">快速注册</h1>
      <span class="header-spacer"></span>
    </div>

    <div class="signup-container">
      <div class="step-bar">
        <span
          class="step-pill"
          :class="{ active: step === 1, done: step === 2 }"
          >1 验证邮箱</span
        >
        <span class="step-line" :class="{ active: step === 2 }"></span>
        <span class="step-pill" :class="{ active: step === 2 }"
          >2 完善资料</span
        >
      </div>

      <form v-if="step === 1" class="signup-form" @submit.prevent>
        <div class="field">
          <div class="input-wrapper" :class="{ error: emailError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
              />
            </svg>
            <input
              v-model="email"
              type="email"
              class="form-input"
              placeholder="请输入邮箱"
              @input="emailError && validateEmail()"
              @blur="validateEmail"
            />
          </div>
          <p v-if="emailError" class="error-text">{{ emailError }}</p>
          <p v-else class="hint-text">
            用于接收注册验证码，且每个邮箱只能注册一个账号
          </p>
        </div>

        <div class="field">
          <div class="input-wrapper" :class="{ error: codeError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
              />
            </svg>
            <input
              v-model="verificationCode"
              type="text"
              maxlength="6"
              class="form-input"
              placeholder="请输入6位验证码"
              @input="codeError && validateCode()"
              @blur="validateCode"
            />
            <button
              class="code-btn"
              :disabled="sendingCode || countdown > 0"
              @click.prevent="handleSendCode"
            >
              {{ countdown > 0 ? `${countdown}s后重发` : "获取验证码" }}
            </button>
          </div>
          <p v-if="codeError" class="error-text">{{ codeError }}</p>
          <p v-else class="hint-text">验证码10分钟内有效，请及时填写</p>
        </div>

        <button class="primary-btn" :disabled="loading" @click="handleNext">
          <span v-if="loading" class="loading-dots"
            ><span class="dot"></span><span class="dot"></span
            ><span class="dot"></span
          ></span>
          <span v-else>下一步</span>
        </button>
      </form>

      <form v-else class="signup-form" @submit.prevent>
        <div class="reg-email-card">
          <span class="reg-email-label">注册邮箱</span>
          <span class="reg-email">{{ email }}</span>
        </div>

        <div class="field">
          <div class="input-wrapper" :class="{ error: accountError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
            <input
              v-model="account"
              type="text"
              class="form-input"
              placeholder="请输入账号"
              @input="accountError && validateAccount()"
              @blur="validateAccount"
            />
          </div>
          <p v-if="accountError" class="error-text">{{ accountError }}</p>
          <p v-else class="hint-text">登录账号，长度至少5位</p>
        </div>

        <div class="field">
          <div class="input-wrapper" :class="{ error: usernameError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M9 11.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm6 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-2-1.5L6 17V9.5C7.42 9.17 9.42 9 12 9s4.58.17 6 .5V17l-2-1.5L14 17h-4zm7.5-5.75c0-.29.25-.5.5-.5s.5.21.5.5-.25.5-.5.5-.5-.21-.5-.5zm-14 0c0-.29.25-.5.5-.5s.5.21.5.5-.25.5-.5.5-.5-.21-.5-.5z"
              />
            </svg>
            <input
              v-model="username"
              type="text"
              class="form-input"
              placeholder="请输入昵称"
              @input="usernameError && validateUsername()"
              @blur="validateUsername"
            />
          </div>
          <p v-if="usernameError" class="error-text">{{ usernameError }}</p>
          <p v-else class="hint-text">昵称不能为空，展示给好友看的名字</p>
        </div>

        <div class="field">
          <div class="input-wrapper" :class="{ error: passwordError }">
            <svg class="input-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"
              />
            </svg>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="请输入密码"
              @input="passwordError && validatePassword()"
              @blur="validatePassword"
            />
            <button
              class="eye-btn"
              aria-label="切换密码可见"
              @click.prevent="showPassword = !showPassword"
            >
              <svg
                v-if="showPassword"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28C2.77 7.81 1.58 9.44.85 11.25c1.73 4.39 6 7.5 11 7.5 1.4 0 2.74-.25 3.98-.7l2.29 2.29L20 18.73 3.73 2.5 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                />
              </svg>
            </button>
          </div>
          <p v-if="passwordError" class="error-text">{{ passwordError }}</p>
          <p v-else class="hint-text">密码必须为14位以上的字母或数字</p>
        </div>

        <div class="btn-row">
          <button
            class="ghost-btn"
            :disabled="loading"
            @click="handlePrev"
          >
            上一步
          </button>
          <button
            class="primary-btn grow"
            :disabled="loading"
            @click="onFinish"
          >
            <span v-if="loading" class="loading-dots"
              ><span class="dot"></span><span class="dot"></span
              ><span class="dot"></span
            ></span>
            <span v-else>完成注册</span>
          </button>
        </div>
      </form>

      <div class="footer-links">
        <span class="footer-text">已有账号？</span>
        <a class="footer-link" @click="goLogin">返回登录</a>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.signup-page {
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
  background: var(--page-bg);
}
.signup-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}
.bg-blob-1 {
  width: 300px;
  height: 300px;
  background: rgba(74, 144, 255, 0.3);
  top: -12%;
  right: -20%;
  animation: blobFloat 12s ease-in-out infinite;
}
.bg-blob-2 {
  width: 250px;
  height: 250px;
  background: rgba(99, 102, 241, 0.25);
  bottom: -8%;
  left: -18%;
  animation: blobFloat 15s ease-in-out infinite;
}
.bg-blob-3 {
  width: 200px;
  height: 200px;
  background: rgba(126, 184, 255, 0.3);
  top: 45%;
  left: 32%;
  animation: blobFloat 10s ease-in-out infinite;
}
@keyframes blobFloat {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-24px, 18px) scale(1.05);
  }
  66% {
    transform: translate(18px, -14px) scale(0.96);
  }
}

.signup-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 4px;
}
.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--glass-bg);
  color: var(--text-primary);
  cursor: pointer;
  svg {
    width: 22px;
    height: 22px;
  }
  &:active {
    background: var(--glass-bg-dark);
  }
}
.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 1px;
}
.header-spacer {
  width: 36px;
}

.signup-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  padding: 18px 24px 30px;
}
.step-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
}
.step-pill {
  font-size: 13px;
  color: var(--text-tertiary);
  background: var(--glass-bg);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 6px 12px;
  transition: all var(--transition-fast);
  &.active {
    color: #fff;
    background: var(--gradient-primary);
    border-color: transparent;
  }
  &.done {
    color: var(--brand-blue);
    background: var(--glass-bg-dark);
  }
}
.step-line {
  width: 34px;
  height: 2px;
  border-radius: 2px;
  background: var(--border-strong);
  transition: all var(--transition-fast);
  &.active {
    background: var(--brand-blue);
  }
}

.signup-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--glass-bg);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 13px 16px;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-xs);
  &:focus-within {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
    background: var(--glass-bg-dark);
  }
  &.error {
    border-color: var(--color-error);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }
}
.input-icon {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.form-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  &::placeholder {
    color: var(--text-placeholder);
  }
}
.code-btn {
  flex-shrink: 0;
  border: none;
  background: var(--brand-blue);
  color: #fff;
  font-size: 13px;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    opacity: 0.8;
  }
}
.eye-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  svg {
    width: 20px;
    height: 20px;
  }
  &:active {
    color: var(--brand-blue);
  }
}
.hint-text {
  font-size: 12px;
  color: var(--text-tertiary);
  padding-left: 16px;
}
.error-text {
  font-size: 12px;
  color: var(--color-error);
  padding-left: 16px;
}

.reg-email-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--glass-bg);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  padding: 12px 16px;
}
.reg-email-label {
  font-size: 12px;
  color: var(--text-tertiary);
}
.reg-email {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
}

.primary-btn {
  width: 100%;
  height: 50px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 3px;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &.grow {
    flex: 1;
  }
}
.ghost-btn {
  height: 50px;
  min-width: 96px;
  background: var(--glass-bg);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  &:active:not(:disabled) {
    background: var(--glass-bg-dark);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.btn-row {
  display: flex;
  gap: 12px;
}
.loading-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.loading-dots .dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: dotPulse 1.4s infinite ease-in-out both;
}
.ghost-btn .loading-dots .dot {
  background: var(--text-tertiary);
}
@keyframes dotPulse {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.footer-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 22px;
}
.footer-text {
  font-size: 13px;
  color: var(--text-tertiary);
}
.footer-link {
  font-size: 13px;
  color: var(--brand-blue);
  text-decoration: none;
  cursor: pointer;
  font-weight: 500;
  &:active {
    opacity: 0.7;
  }
}
</style>
