<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  change_password,
  change_password_send_code,
  list_auth_factors,
} from '@workspace/services';
import { AuthFactorType, type AuthFactorVO } from '@workspace/types';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'go-bind': [];
}>();

const { t: $t } = useI18n();

// 与后端 PASSWORD_REGEX 一致: 14 位以上的字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const emailFactor = ref<AuthFactorVO | null>(null);
const loaded = ref(false);
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const timerRef = ref<ReturnType<typeof setInterval> | null>(null);

const t = (id: string) => $t(`settings.changePassword.${id}`);

const clearTimer = () => {
  if (timerRef.value) {
    clearInterval(timerRef.value);
    timerRef.value = null;
  }
};

const resetForm = () => {
  code.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  countdown.value = 0;
  clearTimer();
};

let cancelled = false;

const loadFactors = async () => {
  cancelled = false;
  loaded.value = false;
  try {
    const data = await list_auth_factors();
    if (cancelled) return;
    emailFactor.value =
      data.list.find((f) => f.factor_type === AuthFactorType.EMAIL) ?? null;
  } catch (e) {
    console.log('加载二次认证因素失败', e);
  } finally {
    if (!cancelled) loaded.value = true;
  }
};

watch(
  () => props.open,
  (open) => {
    if (!open) {
      cancelled = true;
      clearTimer();
      return;
    }
    loadFactors();
  },
);

onBeforeUnmount(() => {
  cancelled = true;
  clearTimer();
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

const onSendCode = async () => {
  sending.value = true;
  try {
    await change_password_send_code({ factor_type: AuthFactorType.EMAIL });
    feedback.message.success(t('codeSent'));
    startCountdown();
  } catch (e) {
    feedback.message.error((e as Error).message || t('sendFailed'));
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  if (!code.value.trim()) {
    feedback.message.warning(t('emptyCode'));
    return;
  }
  if (!PASSWORD_REGEX.test(newPassword.value)) {
    feedback.message.warning(t('invalidPassword'));
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    feedback.message.warning(t('passwordMismatch'));
    return;
  }
  submitting.value = true;
  try {
    await change_password({
      factor_type: AuthFactorType.EMAIL,
      verification_code: code.value.trim(),
      new_password: newPassword.value,
    });
    feedback.message.success(t('success'));
    resetForm();
    emit('close');
  } catch (e) {
    feedback.message.error((e as Error).message || t('failed'));
  } finally {
    submitting.value = false;
  }
};

const handleClose = () => {
  resetForm();
  emit('close');
};

const maskedEmail = computed(() => {
  const value = emailFactor.value?.factor_value || '';
  const at = value.indexOf('@');
  if (at <= 1) return value;
  return `${value.slice(0, 2)}***${value.slice(at)}`;
});
</script>

<template>
  <a-modal
    :title="t('title')"
    :open="open"
    :footer="null"
    @cancel="handleClose"
  >
    <a-space
      v-if="loaded && !emailFactor"
      direction="vertical"
      :size="16"
      style="width: 100%"
    >
      <a-typography-text>{{ t('needBind') }}</a-typography-text>
      <a-button
        type="primary"
        @click="
          () => {
            handleClose();
            emit('go-bind');
          }
        "
      >
        {{ t('goBind') }}
      </a-button>
    </a-space>

    <a-space
      v-else-if="emailFactor"
      direction="vertical"
      :size="12"
      style="width: 100%"
    >
      <div>
        <a-typography-text type="secondary">
          {{ t('verifyBy') }}:
        </a-typography-text>
        <a-typography-text>{{ maskedEmail }}</a-typography-text>
      </div>
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
          {{ countdown > 0 ? `${countdown}s` : t('sendCode') }}
        </a-button>
      </a-space-compact>
      <a-input-password
        v-model:value="newPassword"
        :placeholder="t('newPasswordPlaceholder')"
      />
      <a-input-password
        v-model:value="confirmPassword"
        :placeholder="t('confirmPasswordPlaceholder')"
      />
      <a-button type="primary" block :loading="submitting" @click="onSubmit">
        {{ t('submit') }}
      </a-button>
    </a-space>
  </a-modal>
</template>
