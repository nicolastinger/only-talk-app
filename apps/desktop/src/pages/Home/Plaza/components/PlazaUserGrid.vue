<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { PlazaListResult, PlazaUser } from '@workspace/types';
import PlazaCard from './PlazaCard.vue';
import ProfileModal from './ProfileModal.vue';
import styles from './styles/PlazaList.module.less';

const PAGE_SIZE = 20;

const props = defineProps<{
  fetch: (page: number, pageSize: number) => Promise<PlazaListResult>;
  addType?: string;
  emptyText: string;
}>();

const { t } = useI18n();

const users = ref<PlazaUser[]>([]);
const selected = ref<PlazaUser | null>(null);
const page = ref(1);
const total = ref(0);
const loading = ref(false);

const load = async (p: number, reset: boolean) => {
  loading.value = true;
  try {
    const result = await props.fetch(p, PAGE_SIZE);
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

onMounted(() => load(1, true));

const loadMore = () => load(page.value + 1, false);
const hasMore = computed(() => users.value.length < total.value);
</script>

<template>
  <div v-if="loading && users.length === 0" :class="styles.loading">
    <a-spin />
  </div>
  <template v-else-if="users.length > 0">
    <div :class="styles.grid">
      <PlazaCard
        v-for="user in users"
        :key="user.uuid"
        :user="user"
        :show-crush="false"
        @click="selected = user"
      />
    </div>
    <div v-if="hasMore" :class="styles.loadMore">
      <a-button :loading="loading" @click="loadMore">
        {{ t('plaza.loadMore') }}
      </a-button>
    </div>
  </template>
  <div v-else :class="styles.empty">{{ emptyText }}</div>
  <ProfileModal
    :user="selected"
    :add-type="addType"
    @close="selected = null"
  />
</template>
