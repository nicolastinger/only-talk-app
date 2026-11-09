<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { get_moment_list } from '@workspace/services';
import type { MomentVo } from '@workspace/types';
import { useRouter } from 'vue-router';
import { useI18n } from '@/i18n';
import CommentModal from './CommentModal.vue';
import MomentCard from './MomentCard.vue';
import styles from './styles/MomentList.module.less';

const PAGE_SIZE = 10;
const GAP = 22;

const props = defineProps<{
  refreshKey: number;
  authorUuid?: string;
  feed?: string;
  emptyText?: string;
}>();

const { t } = useI18n();
const router = useRouter();

const moments = ref<MomentVo[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const selected = ref<MomentVo | null>(null);

const masonryRef = ref<HTMLDivElement | null>(null);
const sentinelRef = ref<HTMLDivElement | null>(null);
const cardEls = new Map<string, HTMLDivElement>();
let loadingLock = false;
let measureTimer: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;

const resolveColumns = (width: number) =>
  width < 640 ? 1 : width < 1000 ? 2 : width < 1400 ? 3 : 4;

const measure = () => {
  const node = masonryRef.value;
  if (!node) return;
  const width = node.clientWidth;
  if (!width) return;
  const count = resolveColumns(width);
  const colWidth = Math.max(
    180,
    Math.floor((width - GAP * (count - 1)) / count),
  );
  const colTops = new Array<number>(count).fill(0);
  moments.value.forEach((m) => {
    const el = cardEls.get(m.uuid);
    if (!el) return;
    el.style.width = `${colWidth}px`;
    const h = el.offsetHeight;
    let c = 0;
    for (let k = 1; k < count; k++) {
      if (colTops[k] < colTops[c]) c = k;
    }
    el.style.transform = `translate(${c * (colWidth + GAP)}px, ${colTops[c]}px)`;
    colTops[c] += h + GAP;
  });
  node.style.height = `${Math.max(
    0,
    colTops.reduce((a, b) => Math.max(a, b), 0) - GAP,
  )}px`;
};

const scheduleMeasure = () => {
  if (measureTimer !== null) window.clearTimeout(measureTimer);
  measureTimer = window.setTimeout(() => {
    measureTimer = null;
    measure();
  }, 60);
};

const setCardRef = (el: unknown, uuid: string) => {
  if (el) cardEls.set(uuid, el as HTMLDivElement);
  else cardEls.delete(uuid);
};

watch(moments, () => measure(), { flush: 'post' });

const load = async (p: number, reset: boolean) => {
  if (loadingLock) return;
  loadingLock = true;
  loading.value = true;
  try {
    const res = await get_moment_list(p, PAGE_SIZE, {
      authorUuid: props.authorUuid,
      feed: props.feed,
    });
    total.value = res.total;
    moments.value = reset ? res.list : [...moments.value, ...res.list];
    page.value = p;
  } catch (e) {
    console.error(e);
  } finally {
    loadingLock = false;
    loading.value = false;
  }
};

watch(
  () => [props.refreshKey, props.authorUuid, props.feed],
  async () => {
    page.value = 1;
    await nextTick();
    load(1, true);
  },
  { immediate: true },
);

const hasMore = computed(() => moments.value.length < total.value);

const setupIntersection = () => {
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  const sentinel = sentinelRef.value;
  if (!sentinel || !hasMore.value) return;
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !loadingLock) {
        load(page.value + 1, false);
      }
    },
    { rootMargin: '0px 0px 250px 0px' },
  );
  intersectionObserver.observe(sentinel);
};

watch([hasMore, page], setupIntersection, { flush: 'post', immediate: true });

onMounted(() => {
  measure();
  if (masonryRef.value) {
    resizeObserver = new ResizeObserver(() => scheduleMeasure());
    resizeObserver.observe(masonryRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  if (measureTimer !== null) window.clearTimeout(measureTimer);
});

const handleCommentCountChange = (momentUuid: string, delta: number) => {
  moments.value = moments.value.map((m) =>
    m.uuid === momentUuid
      ? { ...m, comment_count: Math.max(0, m.comment_count + delta) }
      : m,
  );
};

const defaultEmpty = computed(() =>
  props.feed === 'following'
    ? t('moments.emptyFollowing')
    : props.feed === 'mine'
      ? t('moments.emptyMine')
      : t('moments.empty'),
);

const handleDeleted = (moment: MomentVo) => {
  moments.value = moments.value.filter((m) => m.uuid !== moment.uuid);
  requestAnimationFrame(scheduleMeasure);
};

const handleCommentCount = (delta: number) => {
  if (selected.value) {
    handleCommentCountChange(selected.value.uuid, delta);
  }
};
</script>

<template>
  <div :class="styles.list">
    <div v-if="loading && moments.length === 0" :class="styles.loading">
      <a-spin />
    </div>
    <div v-else-if="moments.length === 0" :class="styles.empty">
      {{ emptyText || defaultEmpty }}
    </div>
    <template v-else>
      <div ref="masonryRef" :class="styles.masonry">
        <div
          v-for="(m, i) in moments"
          :key="m.uuid"
          :ref="(el) => setCardRef(el, m.uuid)"
          :class="styles.item"
        >
          <MomentCard
            :moment="m"
            :index="i"
            @open-comments="selected = $event"
            @open-detail="router.push('/home/moments/' + $event.uuid)"
            @open-user="
              router.push('/home/plaza/user/' + $event.author_uuid)
            "
            @media-load="scheduleMeasure"
            @deleted="handleDeleted"
          />
        </div>
      </div>
      <div ref="sentinelRef" :class="styles.sentinel" />
      <div v-if="loading" :class="styles.loadMore">
        <a-spin size="small" />
      </div>
    </template>
    <CommentModal
      :moment-uuid="selected?.uuid || ''"
      :open="!!selected"
      @close="selected = null"
      @comment-count-change="handleCommentCount"
    />
  </div>
</template>
