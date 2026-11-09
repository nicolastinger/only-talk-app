<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '@/i18n';
import { get_plaza_users } from '@workspace/services';
import type { PlazaUser } from '@workspace/types';
import { useBearStore } from '@/stores/app';
import MatchModal from './MatchModal.vue';
import PlazaCard from './PlazaCard.vue';
import PlazaFilter, { type PlazaFilterState } from './PlazaFilter.vue';
import ProfileModal from './ProfileModal.vue';
import styles from './styles/PlazaList.module.less';

const PAGE_SIZE = 20;

const { t } = useI18n();
const router = useRouter();
const store = useBearStore();

const users = ref<PlazaUser[]>([]);
const selected = ref<PlazaUser | null>(null);
const matched = ref<PlazaUser | null>(null);

const page = ref(1);
const total = ref(0);
const loading = ref(false);
const filter = ref<PlazaFilterState>({});

const load = async (p: number, reset: boolean) => {
  loading.value = true;
  try {
    const result = await get_plaza_users(p, PAGE_SIZE, filter.value);
    total.value = result.total || 0;
    users.value = reset
      ? result.list || []
      : [...users.value, ...(result.list || [])];
    page.value = p;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

watch(filter, () => load(1, true));

onMounted(() => load(1, true));

watch(
  () => store.refreshFlag,
  (value) => {
    if (value > 0) {
      load(1, true);
    }
  },
);

const loadMore = () => load(page.value + 1, false);
const hasMore = computed(() => users.value.length < total.value);

const handleTagClick = (tag: string) => {
  filter.value = { ...filter.value, tag };
};

const setFilter = (value: PlazaFilterState) => {
  filter.value = value;
};

const routeToSettings = () => {
  router.push('/home/settings?tab=plaza');
};
</script>

<template>
  <PlazaFilter :value="filter" @change="setFilter" />
  <div v-if="loading && users.length === 0" :class="styles.loading">
    <a-spin />
  </div>
  <template v-else-if="users.length > 0">
    <div :class="styles.grid">
      <PlazaCard
        v-for="user in users"
        :key="user.uuid"
        :user="user"
        @click="selected = user"
        @tag-click="handleTagClick"
        @matched="matched = $event"
      />
    </div>
    <div v-if="hasMore" :class="styles.loadMore">
      <a-button :loading="loading" @click="loadMore">
        {{ t('plaza.loadMore') }}
      </a-button>
    </div>
  </template>
  <div v-else :class="styles.empty">
    <div :class="styles.emptyText">{{ t('plaza.empty') }}</div>
    <a-button type="primary" @click="routeToSettings">
      {{ t('plaza.emptyAction') }}
    </a-button>
  </div>
  <ProfileModal :user="selected" @close="selected = null" />
  <MatchModal :user="matched" @close="matched = null" />
</template>
