<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { showToast, Loading, Empty } from "vant";
import { get_plaza_users } from "@workspace/services";
import type { PlazaUser } from "@workspace/types";
import { usePagedUsers } from "./usePagedUsers";
import PlazaAvatar from "./PlazaAvatar.vue";
import ProfileSheet from "./ProfileSheet.vue";
import {
  toggleCrush,
  confirmMatch,
  sendPlazaFriendRequest,
  genderText,
} from "./utils";

const PAGE_SIZE = 12;

const paged = usePagedUsers((page) => get_plaza_users(page, PAGE_SIZE));
const { list, loading, finished, loadMore, refresh } = paged;

const cursor = ref(0);
const dx = ref(0);
const dragging = ref(false);
const animating = ref(false);
const moved = ref(false);

const current = computed<PlazaUser | undefined>(() => list.value[cursor.value]);
const peek = computed<PlazaUser | undefined>(
  () => list.value[cursor.value + 1]
);

const cardStyle = computed(() => ({
  transform: `translate3d(${dx.value}px, 0, 0) rotate(${dx.value / 18}deg)`,
  opacity: `${Math.max(0.35, 1 - Math.abs(dx.value) / 700)}`,
}));

const profile = ref<PlazaUser | null>(null);
const sheetShow = ref(false);

let startX = 0;
let startY = 0;

const openProfile = (user: PlazaUser) => {
  profile.value = user;
  sheetShow.value = true;
};

const doHeart = async (user: PlazaUser) => {
  if (!user) return;
  try {
    const result = await toggleCrush(user);
    if (result.matched) {
      const ok = await confirmMatch(user.username || "");
      if (ok) await sendPlazaFriendRequest(user.uuid, "plaza");
    }
  } catch (e) {
    console.error("心动失败", e);
    showToast("操作失败，请重试");
  }
};

const advance = () => {
  cursor.value += 1;
  if (cursor.value >= list.value.length - 1 && !finished.value) {
    loadMore();
  }
};

const settle = (dir: "" | "left" | "right") => {
  if (dir === "right") {
    const user = current.value;
    if (user) doHeart(user);
  }
  dx.value = dir === "" ? 0 : dir === "right" ? 460 : -460;
  setTimeout(() => {
    dx.value = 0;
    animating.value = false;
    if (dir !== "") advance();
  }, 260);
};

const onPointerDown = (e: PointerEvent) => {
  if (animating.value || !current.value) return;
  dragging.value = true;
  moved.value = false;
  startX = e.clientX;
  startY = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onPointerMove = (e: PointerEvent) => {
  if (!dragging.value) return;
  const diffX = e.clientX - startX;
  const diffY = e.clientY - startY;
  if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) moved.value = true;
  dx.value = diffX;
};

const onPointerUp = () => {
  if (!dragging.value) return;
  dragging.value = false;
  const isTap = !moved.value;
  const abs = Math.abs(dx.value);
  const dir = abs > 80 ? (dx.value > 0 ? "right" : "left") : "";
  if (isTap && dir === "") {
    const user = current.value;
    if (user) openProfile(user);
  }
  if (dir === "") {
    animating.value = true;
    settle("");
  } else {
    animating.value = true;
    settle(dir);
  }
};

const onLike = () => {
  if (animating.value || !current.value) return;
  animating.value = true;
  settle("right");
};
const onSkip = () => {
  if (animating.value || !current.value) return;
  animating.value = true;
  settle("left");
};

const restart = async () => {
  cursor.value = 0;
  await refresh();
};

onMounted(refresh);
</script>

<template>
  <div class="swipe">
    <div v-if="!current && loading" class="state-box">
      <Loading size="28">加载中...</Loading>
    </div>

    <div v-else-if="finished && !current" class="state-box">
      <Empty description="暂时没有更多可以速配的朋友啦">
        <template #image>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style="width: 80px; height: 80px; color: var(--border-medium)"
          >
            <path
              d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"
            />
          </svg>
        </template>
      </Empty>
      <button class="restart-btn" @click="restart">重新开始</button>
    </div>

    <template v-else-if="current">
      <p class="hint">左滑跳过 · 右滑心动 · 点击查看资料</p>
      <div class="deck-stage">
        <div v-if="peek" class="deck-card peek">
          <div class="peek-hero">
            <div class="peek-avatar">
              <PlazaAvatar :icon="peek.icon" :size="56" />
            </div>
            <span class="peek-name">{{ peek.username || "未命名" }}</span>
          </div>
          <p v-if="peek.motto" class="peek-motto">{{ peek.motto }}</p>
        </div>

        <div
          class="deck-card current"
          :class="{ dragging }"
          :style="cardStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div class="card-head">
            <span class="head-tag">速配</span>
          </div>
          <div class="card-avatar">
            <PlazaAvatar :icon="current.icon" :size="84" />
          </div>
          <div class="card-name">
            {{ current.username || "未命名" }}
            <span
              v-if="current.gender !== undefined && current.gender !== null"
              class="card-gender"
              :class="
                current.gender === 2
                  ? 'male'
                  : current.gender === 3
                  ? 'female'
                  : ''
              "
            >
              {{ genderText(current.gender) }}
            </span>
          </div>
          <p class="card-meta">
            {{
              [current.age ? `${current.age} 岁` : "", current.address]
                .filter(Boolean)
                .join(" · ")
            }}
          </p>
          <p v-if="current.motto" class="card-motto">{{ current.motto }}</p>
          <p v-else-if="current.info" class="card-motto">{{ current.info }}</p>
          <div v-if="(current.tags || []).length" class="card-tags">
            <span
              v-for="tag in (current.tags || []).slice(0, 4)"
              :key="tag"
              class="card-tag"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="act-btn skip" @click="onSkip">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
        <button class="act-btn like" @click="onLike">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
        </button>
      </div>

      <p class="action-hint">跳过</p>
    </template>

    <ProfileSheet v-model="sheetShow" :user="profile" add-type="plaza" />
  </div>
</template>

<style scoped lang="less">
.swipe {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 60vh;
}

.state-box {
  width: 100%;
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hint {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 6px 0 14px;
}

.deck-stage {
  position: relative;
  width: min(300px, 82vw);
  height: min(440px, 62vh);
}

.deck-card {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-md, 0 10px 30px rgba(74, 144, 255, 0.12));
  padding: 18px;
  overflow: hidden;
}

.deck-card.current {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: grab;
  z-index: 2;
  transition: transform 0.28s ease, opacity 0.28s ease;
  touch-action: none;
  user-select: none;

  &.dragging {
    transition: none;
  }
}

.deck-card.peek {
  z-index: 1;
  transform: translateY(14px) scale(0.96);
  opacity: 0.55;
}

.peek-hero {
  display: flex;
  align-items: center;
  gap: 10px;
}

.peek-avatar {
  padding: 2px;
  border-radius: 50%;
  background: var(--gradient-primary);
}

.peek-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.peek-motto {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.card-head {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.head-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  color: var(--brand-blue);
  background: var(--blue-50);
}

.card-avatar {
  margin-top: 10px;
  padding: 3px;
  border-radius: 50%;
  background: var(--gradient-primary);
  box-shadow: var(--shadow-sm);
}

.card-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-gender {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  color: #fff;

  &.male {
    background: linear-gradient(135deg, #4f8cff, #3b6fe0);
  }

  &.female {
    background: linear-gradient(135deg, #ff8fab, #ff6b81);
  }
}

.card-meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.card-motto {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.card-tags {
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.card-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  color: var(--brand-blue);
  background: var(--blue-50);
}

.actions {
  margin-top: 22px;
  display: flex;
  gap: 44px;
}

.act-btn {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: var(--shadow-md, 0 6px 18px rgba(0, 0, 0, 0.1));
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 26px;
    height: 26px;
  }

  &.skip {
    background: #fff;
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  &.like {
    background: linear-gradient(135deg, #ff8fab, #ff5a7a);
    color: #fff;
  }
}

.action-hint {
  margin-top: 6px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.restart-btn {
  margin-top: 18px;
  height: 38px;
  padding: 0 28px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
</style>
