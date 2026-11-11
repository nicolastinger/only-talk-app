<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { submit_report } from '@workspace/services';
import type { ReportTargetTypeValue } from '@workspace/types';
import styles from './index.module.less';

const props = defineProps<{
  open: boolean;
  targetType: ReportTargetTypeValue;
  targetUuid: string;
  targetName?: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();

const reason = ref('');
const submitting = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = '';
      submitting.value = false;
    }
  },
);

const handleSubmit = async () => {
  const text = reason.value.trim();
  if (!text) {
    feedback.message.warning(t('report.reasonRequired'));
    return;
  }
  submitting.value = true;
  try {
    await submit_report({
      target_type: props.targetType,
      target_uuid: props.targetUuid,
      reason: text,
    });
    feedback.message.success(t('report.success'));
    emit('close');
  } catch (e) {
    feedback.message.error((e as Error).message || t('report.failed'));
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <a-modal
    :title="t('report.title')"
    :open="open"
    :closable="false"
    :ok-text="t('report.submit')"
    :cancel-text="t('report.cancel')"
    :confirm-loading="submitting"
    :ok-button-props="{ danger: true }"
    :class="styles.modal"
    @ok="handleSubmit"
    @cancel="emit('close')"
  >
    <div :class="styles.tip">
      {{
        targetName
          ? t('report.targetTip', { name: targetName })
          : t('report.tip')
      }}
    </div>
    <a-textarea
      v-model:value="reason"
      :rows="4"
      :maxlength="500"
      show-count
      :placeholder="t('report.placeholder')"
    />
  </a-modal>
</template>
