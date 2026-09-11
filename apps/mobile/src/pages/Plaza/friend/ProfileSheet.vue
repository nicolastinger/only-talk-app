<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { PlazaUser } from "@workspace/types";
import { ReportTargetType } from "@workspace/types";
import PlazaAvatar from "./PlazaAvatar.vue";
import ReportSheet from "@/components/ReportSheet.vue";
import { genderText, sendPlazaFriendRequest } from "./utils";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    user: PlazaUser | null;
    addType?: string;
  }>(),
  { addType: "plaza" }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const sending = ref(false);
const sent = ref(false);
const showReport = ref(false);

const show = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

watch(
  () => props.user,
  () => {
    sent.value = false;
    sending.value = false;
  }
);

const infoRows = computed(() => {
  const u = props.user;
  if (!u) return [];
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "性别", value: genderText(u.gender) || "-" });
  rows.push({ label: "年龄", value: u.age ? `${u.age}` : "-" });
  rows.push({ label: "地区", value: u.address || "-" });
  return rows;
});

const onAddFriend = async () => {
  if (!props.user || sending.value || sent.value) return;
  sending.value = true;
  try {
    const ok = await sendPlazaFriendRequest(props.user.uuid, props.addType);
    if (ok) sent.value = true;
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    round
    :style="{ height: '70%' }"
    closeable
    class="profile-sheet"
  >
    <div v-if="user" class="sheet-content">
      <div class="hero">
        <div class="hero-avatar">
          <PlazaAvatar :icon="user.icon" :size="84" />
        </div>
        <div class="hero-name">
          {{ user.username || "未命名" }}
          <span
            v-if="user.gender !== undefined && user.gender !== null"
            class="hero-gender"
            :class="
              user.gender === 2 ? 'male' : user.gender === 3 ? 'female' : ''
            "
          >
            {{ genderText(user.gender) }}
          </span>
        </div>
        <div v-if="user.age || user.address" class="hero-meta">
          {{
            [user.age ? `${user.age} 岁` : "", user.address]
              .filter(Boolean)
              .join(" · ")
          }}
        </div>
      </div>

      <div v-if="user.motto" class="motto">{{ user.motto }}</div>
      <div v-if="user.info" class="bio">{{ user.info }}</div>

      <div class="info-card">
        <div v-for="row in infoRows" :key="row.label" class="info-row">
          <span class="info-label">{{ row.label }}</span>
          <span class="info-value">{{ row.value }}</span>
        </div>
      </div>

      <div v-if="(user.tags || []).length" class="tags">
        <span v-for="tag in user.tags" :key="tag" class="tag-chip">{{
          tag
        }}</span>
      </div>

      <div class="sheet-actions">
        <button
          class="add-btn"
          :disabled="sending || sent"
          @click="onAddFriend"
        >
          {{ sent ? "已发送申请" : sending ? "发送中..." : "加好友" }}
        </button>
        <button class="report-btn" @click="showReport = true">举报</button>
      </div>
    </div>

    <ReportSheet
      v-if="user"
      v-model="showReport"
      :target-type="ReportTargetType.PLAZA_USER"
      :target-uuid="user.uuid"
      :target-name="user.username || ''"
    />
  </van-popup>
</template>

<style scoped lang="less">
.profile-sheet {
  overflow: hidden;
}

.sheet-content {
  height: 100%;
  overflow-y: auto;
  padding: 26px 20px 20px;
  box-sizing: border-box;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hero-avatar {
  padding: 3px;
  border-radius: 50%;
  background: var(--gradient-primary);
}

.hero-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.hero-gender {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  color: #fff;
  background: var(--surface-hover);

  &.male {
    background: linear-gradient(135deg, #4f8cff, #3b6fe0);
  }

  &.female {
    background: linear-gradient(135deg, #ff8fab, #ff6b81);
  }
}

.hero-meta {
  font-size: 13px;
  color: var(--text-tertiary);
}

.motto {
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  border-left: 3px solid var(--brand-blue);
  padding-left: 10px;
  font-style: italic;
}

.bio {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.info-card {
  margin-top: 14px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 4px 14px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  font-size: 14px;
  color: var(--text-tertiary);
}

.info-value {
  font-size: 14px;
  color: var(--text-primary);
}

.tags {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  font-size: 12px;
  padding: 4px 11px;
  border-radius: var(--radius-full);
  color: var(--brand-blue);
  background: var(--blue-50);
  border: 1px solid rgba(74, 144, 255, 0.15);
}

.sheet-actions {
  margin-top: 20px;
  padding-bottom: 10px;
}

.add-btn {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: opacity var(--transition-fast);

  &:disabled {
    opacity: 0.6;
  }
}

.report-btn {
  width: 100%;
  height: 42px;
  margin-top: 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 14px;
  cursor: pointer;
}
</style>
