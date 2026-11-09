<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { CloseOutlined, HeartOutlined } from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { get_plaza_users, getFiles, switch_plaza_crush } from '@workspace/services';
import type { PlazaUser } from '@workspace/types';
import MatchModal from './MatchModal.vue';
import ProfileModal from './ProfileModal.vue';
import { getGenderLabel } from './genderHelper';
import styles from './styles/SwipeDeck.module.less';

const PAGE_SIZE = 20;
const SWIPE_THRESHOLD = 140;

const { t } = useI18n();
const genderIntl = {
  formatMessage: (d: { id: string }) => t(d.id),
};

const hashHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
};

const stack = ref<PlazaUser[]>([]);
const hasMore = ref(false);
const loading = ref(false);
const currentIndex = ref(-1);
const selected = ref<PlazaUser | null>(null);
const matched = ref<PlazaUser | null>(null);
const avatars = ref<Record<string, string>>({});

const pageRef = ref(1);
let loadingLock = false;

const dx = ref(0);
const dragging = ref(false);
const animating = ref(false);
const moved = ref(false);

let startX = 0;
let startY = 0;

const currentUser = computed(() => stack.value[currentIndex.value]);
const visibleStack = computed(() =>
  stack.value.slice(0, currentIndex.value + 1),
);
const canSwipe = computed(() => currentIndex.value >= 0);
const isEmpty = computed(() => stack.value.length === 0);

const loadAvatars = async (list: PlazaUser[]) => {
  const record = { ...avatars.value };
  for (const user of list) {
    if (user.icon && !record[user.uuid]) {
      try {
        const files = await getFiles(user.icon);
        if (files?.[0]?.tauri_file_path) {
          record[user.uuid] = files[0].tauri_file_path;
        }
      } catch (error) {
        console.error(error);
      }
    }
  }
  avatars.value = record;
};

const load = async (p: number) => {
  if (loadingLock) return;
  loadingLock = true;
  loading.value = true;
  try {
    const res = await get_plaza_users(p, PAGE_SIZE);
    stack.value = res.list || [];
    hasMore.value = (res.total || 0) > (res.list?.length || 0);
    currentIndex.value = Math.max(-1, (res.list?.length || 0) - 1);
    pageRef.value = p;
    loadAvatars(stack.value);
  } catch (error) {
    console.error(error);
  } finally {
    loadingLock = false;
    loading.value = false;
  }
};

onMounted(() => load(1));

watch(currentIndex, (index) => {
  if (index < 0 && stack.value.length > 0 && hasMore.value && !loading.value) {
    load(pageRef.value + 1);
  }
});

const handleSwipe = (dir: string, user: PlazaUser) => {
  if (dir === 'right') {
    switch_plaza_crush({ target_uuid: user.uuid })
      .then((res) => {
        if (res.matched) {
          matched.value = user;
        }
      })
      .catch((error) => {
        console.error(error);
        feedback.message.error(t('plaza.crushFailed'));
      });
  }
};

const settle = (dir: 'left' | 'right') => {
  const user = currentUser.value;
  if (user && dir === 'right') {
    handleSwipe('right', user);
  }
  animating.value = true;
  dx.value = dir === 'right' ? 460 : -460;
  window.setTimeout(() => {
    dx.value = 0;
    animating.value = false;
    currentIndex.value -= 1;
  }, 260);
};

const onPointerDown = (e: PointerEvent, index: number) => {
  if (animating.value || index !== currentIndex.value || !currentUser.value) {
    return;
  }
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
  const abs = Math.abs(dx.value);
  const dir: 'left' | 'right' | '' =
    abs > SWIPE_THRESHOLD ? (dx.value > 0 ? 'right' : 'left') : '';
  if (dir === '') {
    if (!moved.value && currentUser.value) {
      selected.value = currentUser.value;
    }
    animating.value = true;
    dx.value = 0;
    window.setTimeout(() => {
      animating.value = false;
    }, 260);
    return;
  }
  settle(dir);
};

const swipe = (dir: 'left' | 'right') => {
  if (animating.value || !canSwipe.value) return;
  settle(dir);
};

const reset = () => {
  stack.value = [];
  currentIndex.value = -1;
  hasMore.value = false;
  load(1);
};

const wrapperStyle = (index: number): CSSProperties => {
  if (index !== currentIndex.value) {
    return { zIndex: index };
  }
  return {
    zIndex: index,
    transform: `translate3d(${dx.value}px, 0, 0) rotate(${dx.value / 18}deg)`,
    transition: dragging.value ? 'none' : 'transform 0.26s ease',
  };
};

const cardStyle = (user: PlazaUser, index: number): CSSProperties => {
  const dist = currentIndex.value - index;
  const peek = Math.max(0, dist);
  const translateY = peek * 12;
  const scale = 1 - peek * 0.05;
  const hue = hashHue(user.uuid || user.username || '');
  return {
    '--card-hue': hue,
    transform: `translateY(${translateY}px) scale(${scale})`,
  } as CSSProperties;
};

const handleError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.page">
    <div v-if="isEmpty" :class="styles.state">
      <a-spin v-if="loading" />
      <template v-else>
        <div :class="styles.stateText">{{ t('plaza.swipeEmpty') }}</div>
        <a-button type="primary" @click="reset">
          {{ t('plaza.swipeEmptyAction') }}
        </a-button>
      </template>
    </div>
    <template v-else>
      <div :class="styles.hint">{{ t('plaza.swipeHint') }}</div>
      <div :class="styles.deck">
        <div
          v-for="(user, index) in visibleStack"
          :key="user.uuid"
          :class="styles.tinderCard"
          :style="wrapperStyle(index)"
          @pointerdown="onPointerDown($event, index)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div :class="styles.card" :style="cardStyle(user, index)">
            <div :class="styles.cardCover">
              <img
                :class="styles.avatar"
                :src="avatars[user.uuid] || DEFAULT_ICON"
                alt="avatar"
                @error="handleError"
              />
            </div>
            <div :class="styles.cardBody">
              <div :class="styles.cardName">
                {{ user.username || '' }}
                <UserTypeTag :type="user.user_type" />
                <span v-if="user.age" :class="styles.cardAge">
                  {{ user.age }}{{ t('plaza.ageUnit') }}
                </span>
              </div>
              <div :class="styles.cardMeta">
                <span
                  v-if="user.gender !== undefined && user.gender !== null"
                  :class="styles.cardMetaText"
                >
                  {{ getGenderLabel(genderIntl, user.gender) }}
                </span>
                <span v-if="user.address" :class="styles.cardMetaText">
                  {{ user.address }}
                </span>
                <span :class="styles.cardMetaText">
                  {{ t('plaza.viewProfile') }}
                </span>
              </div>
              <div v-if="user.motto || user.info" :class="styles.cardMotto">
                {{ user.motto || user.info }}
              </div>
              <div
                v-if="(user.tags || []).length > 0"
                :class="styles.cardTags"
              >
                <span
                  v-for="tag in user.tags"
                  :key="tag"
                  :class="styles.cardTag"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div :class="styles.actions">
        <button
          type="button"
          :class="[styles.actionBtn, styles.skipBtn]"
          :disabled="!canSwipe"
          :title="t('plaza.swipeSkip')"
          @click="swipe('left')"
        >
          <CloseOutlined />
        </button>
        <button
          type="button"
          :class="[styles.actionBtn, styles.likeBtn]"
          :disabled="!canSwipe"
          :title="t('plaza.swipeLike')"
          @click="swipe('right')"
        >
          <HeartOutlined />
        </button>
      </div>
    </template>

    <ProfileModal :user="selected" @close="selected = null" />
    <MatchModal :user="matched" @close="matched = null" />
  </div>
</template>
