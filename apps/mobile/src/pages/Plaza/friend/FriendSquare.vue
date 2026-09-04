<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { showToast, Loading, Empty } from "vant";
import { get_plaza_users } from "@workspace/services";
import type { PlazaUser, PlazaListQuery } from "@workspace/types";
import { usePagedUsers } from "./usePagedUsers";
import PlazaCard from "./PlazaCard.vue";
import ProfileSheet from "./ProfileSheet.vue";
import { toggleCrush, confirmMatch, sendPlazaFriendRequest } from "./utils";

const PAGE_SIZE = 12;

const genderOptions: { label: string; value: "" | number }[] = [
  { label: "不限", value: "" },
  { label: "男", value: 2 },
  { label: "女", value: 3 },
];
const ageOptions = [
  { label: "不限" },
  { label: "18-25", min: 18, max: 25 },
  { label: "26-35", min: 26, max: 35 },
  { label: "36+", min: 36 },
];

const gender = ref<"" | number>("");
const ageIndex = ref(0);

const query = computed<PlazaListQuery>(() => {
  const age = ageOptions[ageIndex.value];
  return {
    gender: gender.value || undefined,
    age_min: age.min,
    age_max: age.max,
  };
});

const paged = usePagedUsers((page) =>
  get_plaza_users(page, PAGE_SIZE, query.value)
);

const { list, loading, finished, loadMore, refresh } = paged;

const onGender = (value: "" | number) => {
  gender.value = value;
  refresh();
};
const onAge = (index: number) => {
  ageIndex.value = index;
  refresh();
};

const selected = ref<PlazaUser | null>(null);
const sheetShow = ref(false);

const onTap = (user: PlazaUser) => {
  selected.value = user;
  sheetShow.value = true;
};

const onCrush = async (user: PlazaUser) => {
  try {
    const wasLiked = !!user.liked_by_me;
    const result = await toggleCrush(user);
    if (!wasLiked) {
      showToast(user.liked_by_me ? "心动成功" : "已取消");
      if (result.matched) {
        const ok = await confirmMatch(user.username || "");
        if (ok) await sendPlazaFriendRequest(user.uuid, "plaza");
      }
    }
  } catch (e) {
    console.error("心动失败", e);
    showToast("操作失败，请重试");
  }
};

onMounted(refresh);
</script>

<template>
  <div class="square">
    <div class="filter-card">
      <div class="filter-row">
        <span class="filter-label">性别</span>
        <div class="filter-chips">
          <button
            v-for="opt in genderOptions"
            :key="opt.value"
            class="chip"
            :class="{ active: gender === opt.value }"
            @click="onGender(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="filter-row">
        <span class="filter-label">年龄</span>
        <div class="filter-chips">
          <button
            v-for="(opt, i) in ageOptions"
            :key="opt.label"
            class="chip"
            :class="{ active: ageIndex === i }"
            @click="onAge(i)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading && list.length === 0" class="state-box">
      <Loading size="28">加载中...</Loading>
    </div>

    <div v-else-if="list.length === 0" class="state-box">
      <Empty description="暂无符合条件的朋友">
        <template #image>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style="width: 80px; height: 80px; color: var(--border-medium)"
          >
            <path
              d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </template>
      </Empty>
    </div>

    <div v-else class="card-grid">
      <PlazaCard
        v-for="user in list"
        :key="user.uuid"
        :user="user"
        @tap="onTap"
        @crush="onCrush"
      />
    </div>

    <div v-if="!finished && list.length > 0" class="load-more">
      <button class="more-btn" :disabled="loading" @click="loadMore">
        {{ loading ? "加载中..." : "加载更多" }}
      </button>
    </div>

    <ProfileSheet v-model="sheetShow" :user="selected" add-type="plaza" />
  </div>
</template>

<style scoped lang="less">
.square {
  min-height: 40vh;
}

.filter-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-tertiary);
  width: 32px;
}

.filter-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
  }
}

.state-box {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

.card-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.load-more {
  margin: 16px 0 4px;
  text-align: center;
}

.more-btn {
  height: 40px;
  padding: 0 34px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}
</style>
