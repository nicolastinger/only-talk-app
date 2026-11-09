<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RadarChartOutlined } from '@ant-design/icons-vue';
import {
  get_plaza_profile,
  update_plaza_profile,
  update_plaza_tags,
} from '@workspace/services';
import { useBearStore } from '@/stores/app';
import { useI18n } from '@/i18n';
import { feedback } from '@/utils/feedback';
import styles from '../Settings.module.less';

const { t } = useI18n();
const store = useBearStore();
const triggerRefresh = store.triggerRefresh;

const MAX_TAGS = 100;
const MAX_TAG_LEN = 32;

const allowDiscover = ref(false);
const motto = ref('');
const tags = ref<string[]>([]);
const tagInput = ref('');
const switchLoading = ref(false);
const mottoLoading = ref(false);
const tagsLoading = ref(false);

const loadProfile = async () => {
  try {
    const profile = await get_plaza_profile();
    allowDiscover.value = !!profile.allow_discover;
    motto.value = profile.motto || '';
    tags.value = profile.tags || [];
  } catch (error) {
    console.error('获取广场设置失败', error);
    feedback.message.error(t('settings.plazaSettings.loadFailed'));
  }
};

onMounted(() => {
  loadProfile();
});

const handleAllowDiscoverChange = async (checked: boolean) => {
  const prev = allowDiscover.value;
  allowDiscover.value = checked;
  switchLoading.value = true;
  try {
    await update_plaza_profile({ allow_discover: checked });
    triggerRefresh();
  } catch (error) {
    console.error('更新被发现开关失败', error);
    allowDiscover.value = prev;
    feedback.message.error(t('settings.plazaSettings.updateFailed'));
  } finally {
    switchLoading.value = false;
  }
};

const handleSaveMotto = async () => {
  mottoLoading.value = true;
  try {
    await update_plaza_profile({ motto: motto.value });
    triggerRefresh();
    feedback.message.success(t('settings.plazaSettings.saved'));
  } catch (error) {
    console.error('保存交友宣言失败', error);
    feedback.message.error(t('settings.plazaSettings.updateFailed'));
  } finally {
    mottoLoading.value = false;
  }
};

const handleAddTag = () => {
  const tag = tagInput.value.trim();
  if (!tag || tag.length > MAX_TAG_LEN) return;
  if (tags.value.includes(tag)) {
    tagInput.value = '';
    return;
  }
  if (tags.value.length >= MAX_TAGS) {
    feedback.message.warning(t('settings.plazaSettings.tagLimit'));
    return;
  }
  tags.value = [...tags.value, tag];
  tagInput.value = '';
};

const handleRemoveTag = (tag: string) => {
  tags.value = tags.value.filter((item) => item !== tag);
};

const onTagClose = (tag: string) => {
  handleRemoveTag(tag);
};

const handleSaveTags = async () => {
  tagsLoading.value = true;
  try {
    await update_plaza_tags({ tags: tags.value });
    triggerRefresh();
    feedback.message.success(t('settings.plazaSettings.saved'));
  } catch (error) {
    console.error('保存标签失败', error);
    feedback.message.error(t('settings.plazaSettings.updateFailed'));
  } finally {
    tagsLoading.value = false;
  }
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.plazaSettings.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <RadarChartOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.plazaSettings.allowDiscover') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-switch
        :checked="allowDiscover"
        :loading="switchLoading"
        :class="styles.settingSwitch"
        @change="handleAllowDiscoverChange"
      />
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.plazaSettings.allowDiscoverDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <RadarChartOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.plazaSettings.motto') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-textarea
        v-model:value="motto"
        :placeholder="t('settings.plazaSettings.mottoPlaceholder')"
        :max-length="255"
        :rows="3"
        show-count
        :class="styles.textArea"
      />
      <div :class="styles.buttonGroup">
        <a-button
          type="primary"
          :loading="mottoLoading"
          @click="handleSaveMotto"
        >
          {{ t('settings.plazaSettings.mottoSave') }}
        </a-button>
      </div>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <RadarChartOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.plazaSettings.tags') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <div :class="styles.tagEditor">
        <a-tag v-for="tag in tags" :key="tag" closable @close="onTagClose(tag)">
          {{ tag }}
        </a-tag>
        <a-typography-text v-if="tags.length === 0" type="secondary">
          {{ t('settings.plazaSettings.tagEmpty') }}
        </a-typography-text>
      </div>
      <div :class="styles.buttonGroup">
        <a-input
          v-model:value="tagInput"
          :placeholder="t('settings.plazaSettings.tagAddPlaceholder')"
          :max-length="MAX_TAG_LEN"
          :class="styles.tagInput"
          @press-enter="handleAddTag"
        />
        <a-button @click="handleAddTag">
          {{ t('settings.plazaSettings.tagAdd') }}
        </a-button>
        <a-button type="primary" :loading="tagsLoading" @click="handleSaveTags">
          {{ t('settings.plazaSettings.tagSave') }}
        </a-button>
      </div>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.plazaSettings.tagDesc') }}
      </a-typography-text>
    </a-card>
  </div>
</template>
