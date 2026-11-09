<script lang="ts">
export interface PlazaFilterState {
  gender?: number;
  age_min?: number;
  age_max?: number;
  tag?: string;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import styles from './styles/PlazaFilter.module.less';

const props = defineProps<{
  value: PlazaFilterState;
}>();

const emit = defineEmits<{
  (e: 'change', value: PlazaFilterState): void;
}>();

const { t } = useI18n();

const GENDER_OPTIONS = [
  { label: 'filterAll', value: 'all' },
  { label: 'male', value: 'male' },
  { label: 'female', value: 'female' },
] as const;

const AGE_OPTIONS: {
  label: string;
  value: string;
  min?: number;
  max?: number;
}[] = [
  { label: '18-25', value: '18_25', min: 18, max: 25 },
  { label: '26-35', value: '26_35', min: 26, max: 35 },
  { label: '36+', value: '36plus', min: 36 },
];

const genderValue = computed(() =>
  props.value.gender === 2
    ? 'male'
    : props.value.gender === 3
      ? 'female'
      : 'all',
);

const ageValue = computed(() =>
  props.value.age_min !== null && props.value.age_min !== undefined
    ? props.value.age_min >= 36
      ? '36plus'
      : props.value.age_min >= 26
        ? '26_35'
        : '18_25'
    : 'all',
);

const genderOptions = computed(() =>
  GENDER_OPTIONS.map((o) => ({
    label: t(`plaza.${o.label}`),
    value: o.value,
  })),
);

const ageOptions = computed(() => [
  { label: t('plaza.filterAll'), value: 'all' },
  ...AGE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
]);

const handleGender = (label: string | number) => {
  const gender =
    label === 'male' ? 2 : label === 'female' ? 3 : undefined;
  emit('change', { ...props.value, gender });
};

const handleAge = (label: string | number) => {
  if (label === 'all') {
    emit('change', {
      ...props.value,
      age_min: undefined,
      age_max: undefined,
    });
    return;
  }
  const opt = AGE_OPTIONS.find((o) => o.value === label);
  emit('change', { ...props.value, age_min: opt?.min, age_max: opt?.max });
};

const clearTag = () => emit('change', { ...props.value, tag: undefined });
</script>

<template>
  <div :class="styles.filter">
    <div :class="styles.row">
      <span :class="styles.label">{{ t('plaza.gender') }}</span>
      <a-segmented
        size="small"
        :value="genderValue"
        :options="genderOptions"
        @change="handleGender"
      />
      <span :class="styles.label">{{ t('plaza.ageRange') }}</span>
      <a-select
        size="small"
        :style="{ width: '120px' }"
        :value="ageValue"
        :options="ageOptions"
        @change="handleAge"
      />
    </div>

    <div v-if="value.tag" :class="styles.row">
      <span :class="styles.label">{{ t('plaza.tagFilterTitle') }}</span>
      <a-tag closable :class="styles.tag" @close="clearTag">
        #{{ value.tag }}
      </a-tag>
      <a-button size="small" type="link" @click="clearTag">
        {{ t('plaza.clearFilter') }}
      </a-button>
    </div>
  </div>
</template>
