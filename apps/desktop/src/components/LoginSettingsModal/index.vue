<script setup lang="ts">
import { ref, watch } from 'vue';
import { getApiBase, setConfig } from '@workspace/services';
import { CLIENT_CONFIG_KEYS } from '@workspace/types';
import { feedback } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const PRESET_DEV = 'http://127.0.0.1:8443';
const PRESET_PROD = 'https://onlytalk.cn';

type ServerMode = 'dev' | 'prod' | 'custom';

const mode = ref<ServerMode>('prod');
const custom = ref('');
const saving = ref(false);
const currentBase = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const base = getApiBase();
    currentBase.value = base;
    if (base === PRESET_DEV) {
      mode.value = 'dev';
      custom.value = '';
    } else if (base === PRESET_PROD) {
      mode.value = 'prod';
      custom.value = '';
    } else {
      mode.value = 'custom';
      custom.value = base;
    }
  },
);

const handleOk = async () => {
  const value =
    mode.value === 'dev'
      ? PRESET_DEV
      : mode.value === 'prod'
      ? PRESET_PROD
      : custom.value.trim();
  if (!value) {
    feedback.message.warning(t('login.serverRequired'));
    return;
  }
  saving.value = true;
  try {
    await setConfig(CLIENT_CONFIG_KEYS.serverApiBase, value);
    feedback.message.success(t('login.serverSaved'));
    emit('close');
  } catch (e) {
    feedback.message.error(t('login.saveFailed', { error: String(e) }));
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <a-modal
    :open="open"
    :title="t('settings.title')"
    :closable="false"
    :confirm-loading="saving"
    :ok-text="t('common.save')"
    :cancel-text="t('common.cancel')"
    :width="420"
    destroy-on-close
    @ok="handleOk"
    @cancel="emit('close')"
  >
    <div :class="styles.section">
      <div :class="styles.sectionTitle">{{ t('login.serverSettings') }}</div>
      <a-radio-group v-model:value="mode">
        <a-space direction="vertical" :size="10">
          <a-radio value="dev">
            {{ t('login.presetDev') }}
            <span :class="styles.hint">{{ PRESET_DEV }}</span>
          </a-radio>
          <a-radio value="prod">
            {{ t('login.presetProd') }}
            <span :class="styles.hint">{{ PRESET_PROD }}</span>
          </a-radio>
          <a-radio value="custom">{{ t('login.presetCustom') }}</a-radio>
        </a-space>
      </a-radio-group>
      <a-input
        v-if="mode === 'custom'"
        v-model:value="custom"
        :class="styles.customInput"
        placeholder="https://your-domain.com"
      />
      <a-typography-text type="secondary" :class="styles.tip">
        {{ t('login.currentServer', { url: currentBase }) }}
      </a-typography-text>
    </div>
  </a-modal>
</template>
