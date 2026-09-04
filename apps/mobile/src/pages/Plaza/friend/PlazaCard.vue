<script setup lang="ts">
import { computed } from "vue";
import type { PlazaUser } from "@workspace/types";
import PlazaAvatar from "./PlazaAvatar.vue";
import { isMale, isFemale, genderText } from "./utils";

const props = withDefaults(
  defineProps<{
    user: PlazaUser;
    showCrush?: boolean;
  }>(),
  { showCrush: true }
);

const emit = defineEmits<{
  (e: "crush", user: PlazaUser): void;
  (e: "tap", user: PlazaUser): void;
}>();

const genderClass = computed(() => {
  if (isMale(props.user.gender)) return "male";
  if (isFemale(props.user.gender)) return "female";
  return "";
});

const meta = computed(() => {
  const parts: string[] = [];
  const g = genderText(props.user.gender);
  if (g) parts.push(g);
  if (props.user.age) parts.push(`${props.user.age} 岁`);
  if (props.user.address) parts.push(props.user.address);
  return parts.join(" · ");
});

const shownTags = computed(() => (props.user.tags || []).slice(0, 3));
const moreTagCount = computed(() =>
  Math.max((props.user.tags || []).length - 3, 0)
);
</script>

<template>
  <div class="p-card" @click="emit('tap', user)">
    <div class="p-head">
      <div class="p-avatar">
        <PlazaAvatar :icon="user.icon" :size="52" />
      </div>
      <button
        v-if="showCrush"
        class="p-heart"
        :class="{ liked: user.liked_by_me }"
        @click.stop="emit('crush', user)"
      >
        <svg
          viewBox="0 0 24 24"
          :fill="user.liked_by_me ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
      </button>
    </div>

    <div class="p-name-row">
      <span class="p-name">{{ user.username || "未命名" }}</span>
      <span v-if="genderClass" class="p-gender" :class="genderClass">
        {{ genderText(user.gender) }}
      </span>
    </div>

    <p v-if="meta" class="p-meta">{{ meta }}</p>

    <p v-if="user.motto" class="p-motto">{{ user.motto }}</p>
    <p v-else-if="user.info" class="p-motto">{{ user.info }}</p>

    <div v-if="shownTags.length" class="p-tags">
      <span v-for="tag in shownTags" :key="tag" class="p-tag">{{ tag }}</span>
      <span v-if="moreTagCount > 0" class="p-tag more"
        >+{{ moreTagCount }}</span
      >
    </div>
  </div>
</template>

<style scoped lang="less">
.p-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 14px;
  cursor: pointer;
  transition: transform var(--transition-fast);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  &:active {
    transform: scale(0.97);
  }
}

.p-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.p-avatar {
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
  display: inline-flex;
}

.p-heart {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--surface);
  border-radius: 50%;
  color: var(--text-placeholder);
  box-shadow: var(--shadow-xs);
  cursor: pointer;

  svg {
    width: 18px;
    height: 18px;
  }

  &.liked {
    color: #ff5a7a;
  }
}

.p-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.p-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-gender {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: var(--radius-full);
  color: #fff;

  &.male {
    background: linear-gradient(135deg, #4f8cff, #3b6fe0);
  }

  &.female {
    background: linear-gradient(135deg, #ff8fab, #ff6b81);
  }
}

.p-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-motto {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.p-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.p-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  color: var(--brand-blue);
  background: var(--blue-50);
  border: 1px solid rgba(74, 144, 255, 0.15);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;

  &.more {
    color: var(--text-tertiary);
    background: var(--surface-hover);
    border-color: var(--border-light);
  }
}
</style>
