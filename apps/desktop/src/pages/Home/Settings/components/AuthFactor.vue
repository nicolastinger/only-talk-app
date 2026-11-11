<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { LockOutlined } from '@ant-design/icons-vue';
import {
  create_auth_factor,
  delete_auth_factor,
  list_auth_factors,
  send_auth_factor_code,
} from '@workspace/services';
import { AuthFactorType, type AuthFactorVO } from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t: translate } = useI18n();

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const emailFactor = ref<AuthFactorVO | null>(null);
const email = ref('');
const code = ref('');
const sending = ref(false);
const binding = ref(false);
const countdown = ref(0);
const timerRef = ref<ReturnType<typeof setInterval> | null>(null);
const unbindOpen = ref(false);
const unbindCode = ref('');
const unbindSending = ref(false);
const unbindConfirming = ref(false);
const unbindCountdown = ref(0);
const unbindTimerRef = ref<ReturnType<typeof setInterval> | null>(null);

const t = (id: string, values?: Record<string, string | number>) =>
  translate(`settings.authFactor.${id}`, values);

const loadFactors = async () => {
  try {
    const data = await list_auth_factors();
    emailFactor.value =
      data.list.find((f) => f.factor_type === AuthFactorType.EMAIL) ?? null;
  } catch (e) {
    console.log('加载二次认证因素失败', e);
  }
};

const clearTimer = () => {
  if (timerRef.value) {
    clearInterval(timerRef.value);
    timerRef.value = null;
  }
};

const clearUnbindTimer = () => {
  if (unbindTimerRef.value) {
    clearInterval(unbindTimerRef.value);
    unbindTimerRef.value = null;
  }
};

onMounted(() => {
  loadFactors();
});

onUnmounted(() => {
  clearTimer();
  clearUnbindTimer();
});

const startCountdown = () => {
  countdown.value = 60;
  timerRef.value = setInterval(() => {
    if (countdown.value <= 1) {
      clearTimer();
      countdown.value = 0;
      return;
    }
    countdown.value -= 1;
  }, 1000);
};

const startUnbindCountdown = () => {
  unbindCountdown.value = 60;
  unbindTimerRef.value = setInterval(() => {
    if (unbindCountdown.value <= 1) {
      clearUnbindTimer();
      unbindCountdown.value = 0;
      return;
    }
    unbindCountdown.value -= 1;
  }, 1000);
};

const onSendCode = async () => {
  if (!EMAIL_REGEX.test(email.value.trim())) {
    feedback.message.warning(t('invalidEmail'));
    return;
  }
  sending.value = true;
  try {
    await send_auth_factor_code({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
    });
    feedback.message.success(t('codeSent'));
    startCountdown();
  } catch (e) {
    feedback.message.error((e as Error).message || t('bindFailed'));
  } finally {
    sending.value = false;
  }
};

const onBind = async () => {
  if (!EMAIL_REGEX.test(email.value.trim())) {
    feedback.message.warning(t('invalidEmail'));
    return;
  }
  if (!code.value.trim()) {
    feedback.message.warning(t('emptyCode'));
    return;
  }
  binding.value = true;
  try {
    await create_auth_factor({
      factor_type: AuthFactorType.EMAIL,
      factor_value: email.value.trim(),
      verification_code: code.value.trim(),
    });
    feedback.message.success(t('bindSuccess'));
    email.value = '';
    code.value = '';
    await loadFactors();
  } catch (e) {
    feedback.message.error((e as Error).message || t('bindFailed'));
  } finally {
    binding.value = false;
  }
};

const onUnbind = () => {
  if (!emailFactor.value) return;
  unbindCode.value = '';
  unbindCountdown.value = 0;
  unbindOpen.value = true;
};

const onSendUnbindCode = async () => {
  if (!emailFactor.value) return;
  unbindSending.value = true;
  try {
    await send_auth_factor_code({
      factor_type: AuthFactorType.EMAIL,
      scene: 'unbind',
    });
    feedback.message.success(t('codeSent'));
    startUnbindCountdown();
  } catch (e) {
    feedback.message.error((e as Error).message || t('bindFailed'));
  } finally {
    unbindSending.value = false;
  }
};

const onUnbindConfirm = async () => {
  if (!emailFactor.value) return;
  if (!unbindCode.value.trim()) {
    feedback.message.warning(t('emptyCode'));
    return;
  }
  unbindConfirming.value = true;
  try {
    await delete_auth_factor({
      id: emailFactor.value.id,
      factor_type: AuthFactorType.EMAIL,
      verification_code: unbindCode.value.trim(),
    });
    feedback.message.success(t('unbindSuccess'));
    unbindOpen.value = false;
    await loadFactors();
  } catch (e) {
    feedback.message.error((e as Error).message || t('unbindFailed'));
  } finally {
    unbindConfirming.value = false;
  }
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <LockOutlined :class="styles.cardIcon" />
        <a-typography-text strong>{{ t('emailSection') }}</a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-space
        v-if="emailFactor"
        direction="vertical"
        :size="12"
        style="width: 100%"
      >
        <div>
          <a-typography-text>{{ emailFactor.factor_value }}</a-typography-text>
          <a-typography-text type="success" style="margin-left: 8px">
            {{ t('bound') }}
          </a-typography-text>
        </div>
        <a-button danger @click="onUnbind">{{ t('unbind') }}</a-button>
      </a-space>
      <a-space v-else direction="vertical" :size="12" style="width: 100%">
        <a-input
          v-model:value="email"
          :placeholder="t('emailPlaceholder')"
          :addon-before="t('emailLabel')"
          allow-clear
        />
        <a-space-compact style="width: 100%">
          <a-input
            v-model:value="code"
            :placeholder="t('codePlaceholder')"
            :max-length="6"
          />
          <a-button
            :loading="sending"
            :disabled="countdown > 0"
            @click="onSendCode"
          >
            {{
              countdown > 0
                ? t('resend', { seconds: countdown })
                : t('sendCode')
            }}
          </a-button>
        </a-space-compact>
        <a-button type="primary" :loading="binding" @click="onBind">
          {{ t('bind') }}
        </a-button>
      </a-space>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <LockOutlined :class="styles.cardIcon" />
        <a-typography-text strong>{{ t('otherSection') }}</a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div
        style="display: flex; justify-content: space-between; padding: 8px 0"
      >
        <a-typography-text type="secondary">{{ t('phone') }}</a-typography-text>
        <a-typography-text type="secondary">
          {{ t('comingSoon') }}
        </a-typography-text>
      </div>
      <div
        style="display: flex; justify-content: space-between; padding: 8px 0"
      >
        <a-typography-text type="secondary">{{ t('other') }}</a-typography-text>
        <a-typography-text type="secondary">
          {{ t('comingSoon') }}
        </a-typography-text>
      </div>
    </a-card>

    <a-typography-text type="secondary" :class="styles.description">
      {{ t('tip') }}
    </a-typography-text>

    <a-modal
      :title="t('unbindConfirmTitle')"
      :open="unbindOpen"
      :confirm-loading="unbindConfirming"
      :ok-text="t('unbind')"
      :cancel-text="translate('settings.blacklist.cancel')"
      :ok-button-props="{ danger: true }"
      :width="420"
      centered
      @ok="onUnbindConfirm"
      @cancel="unbindOpen = false"
    >
      <div style="margin-bottom: 12px">
        <a-typography-text>
          {{
            t('unbindConfirmMsg', { email: emailFactor?.factor_value ?? '' })
          }}
        </a-typography-text>
      </div>
      <a-space-compact style="width: 100%">
        <a-input
          v-model:value="unbindCode"
          :placeholder="t('codePlaceholder')"
          :max-length="6"
        />
        <a-button
          :loading="unbindSending"
          :disabled="unbindCountdown > 0"
          @click="onSendUnbindCode"
        >
          {{
            unbindCountdown > 0
              ? t('resend', { seconds: unbindCountdown })
              : t('sendCode')
          }}
        </a-button>
      </a-space-compact>
    </a-modal>
  </div>
</template>
