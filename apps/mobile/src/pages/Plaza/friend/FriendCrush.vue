<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loading, Empty } from "vant";
import { get_plaza_likes } from "@workspace/services";
import type { PlazaUser } from "@workspace/types";
import { usePagedUsers } from "./usePagedUsers";
import PlazaCard from "./PlazaCard.vue";
import ProfileSheet from "./ProfileSheet.vue";

const PAGE_SIZE = 12;

const paged = usePagedUsers((page) => get_plaza_likes(page, PAGE_SIZE));
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
  <div class="crush">
    <div v-if="loading && list.length === 0" class="state-box">
      <Loading size="28">加载中...</Loading>
    </div>

    <div v-else-if="list.length === 0" class="state-box">
      <Empty description="还没有心动过的朋友，去广场逛逛吧">
        <template #image>
          <img
            src="@/assets/empty-state.svg"
            class="empty-state-img"
            alt="暂无内容"
          />
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

    <ProfileSheet v-model="sheetShow" :user="selected" add-type="plaza" />
  </div>
</template>

<style scoped lang="less">
.crush {
  min-height: 40vh;
}

.state-box {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

.empty-state-img {
  width: 120px;
  height: 96px;
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
