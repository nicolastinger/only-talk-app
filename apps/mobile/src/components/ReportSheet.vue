<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { showToast } from "vant";
import { submit_report } from "@workspace/services";
import type { ReportTargetTypeValue } from "@workspace/types";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    targetType: ReportTargetTypeValue;
    targetUuid: string;
    targetName?: string;
  }>(),
  { targetName: "" }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "success"): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

const reason = ref("");
const submitting = ref(false);

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      reason.value = "";
      submitting.value = false;
    }
  }
);

const onSubmit = async () => {
  const text = reason.value.trim();
  if (!text) {
    showToast("请填写举报原因");
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  try {
    await submit_report({
      target_type: props.targetType,
      target_uuid: props.targetUuid,
      reason: text,
    });
    showToast({ message: "举报已提交", icon: "success" });
    emit("success");
    show.value = false;
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "举报失败，请重试";
    showToast(msg);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    round
    closeable
    class="report-sheet"
  >
    <div class="report-body">
      <h3 class="report-title">
        举报{{ targetName ? `「${targetName}」` : "" }}
      </h3>
      <p class="report-tip">请描述举报原因，我们会在核实后处理</p>
      <van-field
        v-model="reason"
        type="textarea"
        rows="4"
        maxlength="500"
        show-word-limit
        placeholder="请输入举报原因（必填）"
      />
      <button class="report-submit" :disabled="submitting" @click="onSubmit">
        {{ submitting ? "提交中..." : "提交举报" }}
      </button>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.report-body {
  padding: 22px 20px calc(16px + env(safe-area-inset-bottom));
}

.report-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.report-tip {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.report-submit {
  width: 100%;
  height: 46px;
  margin-top: 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast);

  &:disabled {
    opacity: 0.6;
  }
}
</style>
