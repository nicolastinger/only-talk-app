<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loading, Empty } from "vant";
import { get_plaza_matches } from "@workspace/services";
import type { PlazaUser } from "@workspace/types";
import { usePagedUsers } from "./usePagedUsers";
import PlazaCard from "./PlazaCard.vue";
import ProfileSheet from "./ProfileSheet.vue";

const PAGE_SIZE = 12;

const paged = usePagedUsers((page) => get_plaza_matches(page, PAGE_SIZE));
const { list, loading, finished, loadMore, refresh } = paged;

const selected = ref<PlazaUser | null>(null);
const sheetShow = ref(false);

const onTap = (user: PlazaUser) => {
  selected.value = user;
  sheetShow.value = true;
};

onMounted(refresh);
</script>

<template>
  <div class="matches">
    <div v-if="loading && list.length === 0" class="state-box">
      <Loading size="28">加载中...</Loading>
    </div>

    <div v-else-if="list.length === 0" class="state-box">
      <Empty description="还没有互相心动的人，去速配试试吧">
        <template #image>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style="width: 80px; height: 80px; color: var(--border-medium)"
          >
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
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
        :show-crush="false"
        @tap="onTap"
      />
    </div>

    <div v-if="!finished && list.length > 0" class="load-more">
      <button class="more-btn" :disabled="loading" @click="loadMore">
        {{ loading ? "加载中..." : "加载更多" }}
      </button>
    </div>

    <ProfileSheet v-model="sheetShow" :user="selected" add-type="plaza_match" />
  </div>
</template>

<style scoped lang="less">
.matches {
  min-height: 40vh;
}

.state-box {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

.card-grid {
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
