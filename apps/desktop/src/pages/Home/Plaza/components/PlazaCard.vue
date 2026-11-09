<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UserTypeTag from '@/components/UserTypeTag/index.vue';
import { DEFAULT_ICON } from '@/constants';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import { getFiles, switch_plaza_crush } from '@workspace/services';
import type { PlazaUser } from '@workspace/types';
import { getGenderLabel } from './genderHelper';
import styles from './styles/PlazaCard.module.less';

const MAX_TAGS_SHOWN = 3;

const props = withDefaults(
  defineProps<{
    user: PlazaUser;
    showCrush?: boolean;
  }>(),
  {
    showCrush: true,
  },
);

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'tagClick', tag: string): void;
  (e: 'matched', user: PlazaUser): void;
}>();

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

const userIcon = ref<string | null>(null);
const liked = ref(!!props.user.liked_by_me);
const crushing = ref(false);

const hue = computed(() =>
  hashHue(props.user.uuid || props.user.username || ''),
);

watch(
  () => props.user.liked_by_me,
  (value) => {
    liked.value = !!value;
  },
);

const getUserIcon = async (icon: string) => {
  try {
    if (!icon) {
      userIcon.value = null;
      return;
    }
    const FileVos = await getFiles(icon);
    userIcon.value = FileVos?.[0]?.tauri_file_path || null;
  } catch (error) {
    console.log(error);
  }
};

watch(
  () => props.user.icon,
  (value) => getUserIcon(value || ''),
  { immediate: true },
);

const cardStyle = computed(() => ({ '--card-hue': hue.value }));

const genderClass = computed(() =>
  props.user.gender === 2
    ? styles.male
    : props.user.gender === 3
      ? styles.female
      : '',
);

const shownTags = computed(() =>
  (props.user.tags || []).slice(0, MAX_TAGS_SHOWN),
);
const restCount = computed(
  () => (props.user.tags || []).length - shownTags.value.length,
);

const handleCrush = async (e: MouseEvent) => {
  e.stopPropagation();
  if (crushing.value) return;
  crushing.value = true;
  try {
    const result = await switch_plaza_crush({
      target_uuid: props.user.uuid,
    });
    liked.value = !liked.value;
    if (result.matched) {
      emit('matched', props.user);
    }
  } catch (error) {
    console.error(error);
    feedback.message.error(t('plaza.crushFailed'));
  } finally {
    crushing.value = false;
  }
};

const handleTagClick = (e: MouseEvent, tag: string) => {
  e.stopPropagation();
  emit('tagClick', tag);
};

const handleError = (e: Event) => {
  (e.target as HTMLImageElement).src = DEFAULT_ICON;
};
</script>

<template>
  <div :class="styles.container" :style="cardStyle" @click="emit('click')">
    <div :class="styles.cover">
      <div :class="styles.coverIcon">
        <img
          :src="userIcon || DEFAULT_ICON"
          :class="styles.avatar"
          alt="avatar"
          @error="handleError"
        />
      </div>
      <button
        v-if="showCrush"
        type="button"
        :class="[styles.crushBtn, liked ? styles.crushActive : '']"
        :title="t(liked ? 'plaza.crushed' : 'plaza.crush')"
        @click="handleCrush"
      >
        {{ liked ? '♥' : '♡' }}
      </button>
    </div>
    <div :class="styles.body">
      <div :class="styles.name">
        {{ user.username || '' }}
        <UserTypeTag :type="props.user.user_type" />
      </div>

      <div :class="styles.meta">
        <span
          v-if="user.gender !== undefined && user.gender !== null"
          :class="[styles.gender, genderClass]"
        >
          {{ getGenderLabel(genderIntl, user.gender) }}
        </span>
        <span v-if="user.age" :class="styles.metaText">
          {{ user.age }}{{ t('plaza.ageUnit') }}
        </span>
        <span v-if="user.address" :class="styles.metaText">
          {{ user.address }}
        </span>
      </div>

      <div v-if="user.motto || user.info" :class="styles.motto">
        {{ user.motto || user.info }}
      </div>

      <div v-if="shownTags.length > 0" :class="styles.tags">
        <span
          v-for="tag in shownTags"
          :key="tag"
          :class="styles.tag"
          @click="handleTagClick($event, tag)"
        >
          {{ tag }}
        </span>
        <span v-if="restCount > 0" :class="styles.tagMore">+{{ restCount }}</span>
      </div>
    </div>
  </div>
</template>
