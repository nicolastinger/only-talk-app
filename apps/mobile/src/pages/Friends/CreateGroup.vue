<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { create_group, create_group_chat_session } from "@workspace/services";

const router = useRouter();

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
    showToast({ message: "请输入群名称", icon: "none" });
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
    showToast({ message: "群聊创建成功", icon: "success" });
    setTimeout(
      () => router.replace(`/chats/group-chat/${group.group_uuid}`),
      500
    );
  } catch (e) {
    console.error("创建群聊失败:", e);
    showToast((e as Error).message || "创建群聊失败");
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
      <h1 class="title">发起群聊</h1>
    </div>

    <div class="form-card">
      <div class="field">
        <label class="field-label">群名称 <em class="required">*</em></label>
        <input
          v-model="groupName"
          class="field-input"
          type="text"
          placeholder="请输入群名称"
          maxlength="100"
        />
        <span class="field-count">{{ groupName.length }}/100</span>
      </div>

      <div class="field">
        <label class="field-label">群描述</label>
        <textarea
          v-model="description"
          class="field-input field-textarea"
          placeholder="介绍一下这个群聊（选填）"
          maxlength="500"
          rows="3"
        ></textarea>
        <span class="field-count">{{ description.length }}/500</span>
      </div>

      <div class="field">
        <label class="field-label">最大成员数</label>
        <input
          v-model.number="maxMembers"
          class="field-input"
          type="number"
          min="1"
          max="9999"
          @input="onMaxInput"
        />
        <span class="field-hint">默认 500，范围 1-9999</span>
      </div>
    </div>

    <button class="submit-btn" :disabled="creating" @click="submit">
      {{ creating ? "创建中..." : "创建群聊" }}
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
