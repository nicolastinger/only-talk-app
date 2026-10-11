<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { create_group, create_group_chat_session } from "@workspace/services";
import { useI18n } from "@/i18n";

const router = useRouter();
const { t } = useI18n();

const groupName = ref("");
const description = ref("");
const maxMembers = ref<number>(500);
const creating = ref(false);

const back = () => router.back();

const onMaxInput = (e: Event) => {
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) {
    maxMembers.value = 1;
    return;
  }
  maxMembers.value = Math.min(9999, Math.max(1, Math.floor(v)));
};

const submit = async () => {
  const name = groupName.value.trim();
  if (creating.value) return;
  if (!name) {
    showToast({ message: t("contacts.createGroup.nameRequired"), icon: "none" });
    return;
  }
  creating.value = true;
  try {
    const group = await create_group({
      group_name: name,
      avatar: "",
      description: description.value.trim() || undefined,
      max_members: maxMembers.value,
    });
    try {
      await create_group_chat_session(group.group_uuid);
    } catch {
      /* 会话可能已存在 */
    }
    showToast({ message: t("contacts.createGroup.success"), icon: "success" });
    const qp = new URLSearchParams();
    qp.set("name", group.group_name || name);
    if (group.member_count > 0) qp.set("mc", String(group.member_count));
    setTimeout(
      () =>
        router.replace(
          `/chats/group-chat/${group.group_uuid}${
            qp.size ? `?${qp.toString()}` : ""
          }`
        ),
      500
    );
  } catch (e) {
    console.error("创建群聊失败:", e);
    showToast((e as Error).message || t("contacts.createGroup.failed"));
  } finally {
    creating.value = false;
  }
};
</script>

<template>
  <div class="create-group-page">
    <div class="header">
      <button class="back-btn" @click="back">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">{{ t("contacts.createGroup.title") }}</h1>
    </div>

    <div class="form-card">
      <div class="field">
        <label class="field-label"
          >{{ t("contacts.createGroup.nameLabel") }}
          <em class="required">*</em></label
        >
        <input
          v-model="groupName"
          class="field-input"
          type="text"
          :placeholder="t('contacts.createGroup.namePlaceholder')"
          maxlength="100"
        />
        <span class="field-count">{{ groupName.length }}/100</span>
      </div>

      <div class="field">
        <label class="field-label">{{
          t("contacts.createGroup.descLabel")
        }}</label>
        <textarea
          v-model="description"
          class="field-input field-textarea"
          :placeholder="t('contacts.createGroup.descPlaceholder')"
          maxlength="500"
          rows="3"
        ></textarea>
        <span class="field-count">{{ description.length }}/500</span>
      </div>

      <div class="field">
        <label class="field-label">{{
          t("contacts.createGroup.maxMembersLabel")
        }}</label>
        <input
          v-model.number="maxMembers"
          class="field-input"
          type="number"
          min="1"
          max="9999"
          @input="onMaxInput"
        />
        <span class="field-hint">{{ t("contacts.createGroup.maxHint") }}</span>
      </div>
    </div>

    <button class="submit-btn" :disabled="creating" @click="submit">
      {{
        creating
          ? t("contacts.createGroup.creating")
          : t("contacts.createGroup.submit")
      }}
    </button>
  </div>
</template>

<style scoped lang="less">
.create-group-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: max(12px, env(safe-area-inset-top)) 16px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;

  svg {
    width: 24px;
    height: 24px;
  }
}

.title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.form-card {
  margin: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.field {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;

  .required {
    font-style: normal;
    color: var(--color-error);
  }
}

.field-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.field-textarea {
  resize: none;
  line-height: 1.5;
}

.field-count {
  display: block;
  text-align: right;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.submit-btn {
  display: block;
  width: calc(100% - 32px);
  height: 46px;
  margin: 20px 16px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}
</style>
