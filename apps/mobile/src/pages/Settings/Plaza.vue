<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import {
  get_plaza_profile,
  update_plaza_profile,
  update_plaza_tags,
} from "@workspace/services";

const MAX_TAGS = 100;
const MAX_TAG_LEN = 32;

const router = useRouter();
const allowDiscover = ref(false);
const motto = ref("");
const tags = ref<string[]>([]);
const tagInput = ref("");
const switchLoading = ref(false);
const mottoLoading = ref(false);
const tagsLoading = ref(false);

const loadProfile = async () => {
  try {
    const profile = await get_plaza_profile();
    allowDiscover.value = !!profile.allow_discover;
    motto.value = profile.motto || "";
    tags.value = profile.tags || [];
  } catch (error) {
    console.error("获取广场设置失败", error);
    showToast({ message: "获取广场设置失败", icon: "fail" });
  }
};

onMounted(() => {
  loadProfile();
});

const goBack = () => router.back();

const onAllowDiscoverChange = async (checked: boolean) => {
  const prev = allowDiscover.value;
  allowDiscover.value = checked;
  switchLoading.value = true;
  try {
    await update_plaza_profile({ allow_discover: checked });
    showToast({ message: "已保存", icon: "success" });
  } catch (error) {
    console.error("更新被发现开关失败", error);
    allowDiscover.value = prev;
    showToast({ message: "保存失败", icon: "fail" });
  } finally {
    switchLoading.value = false;
  }
};

const onSaveMotto = async () => {
  mottoLoading.value = true;
  try {
    await update_plaza_profile({ motto: motto.value });
    showToast({ message: "宣言已保存", icon: "success" });
  } catch (error) {
    console.error("保存交友宣言失败", error);
    showToast({ message: "保存失败", icon: "fail" });
  } finally {
    mottoLoading.value = false;
  }
};

const addTag = () => {
  const tag = tagInput.value.trim();
  if (!tag || tag.length > MAX_TAG_LEN) return;
  if (tags.value.includes(tag)) {
    tagInput.value = "";
    return;
  }
  if (tags.value.length >= MAX_TAGS) {
    showToast({ message: "最多添加 100 个标签", icon: "none" });
    return;
  }
  tags.value = [...tags.value, tag];
  tagInput.value = "";
};

const removeTag = (tag: string) => {
  tags.value = tags.value.filter((t) => t !== tag);
};

const onSaveTags = async () => {
  tagsLoading.value = true;
  try {
    await update_plaza_tags({ tags: tags.value });
    showToast({ message: "标签已保存", icon: "success" });
  } catch (error) {
    console.error("保存标签失败", error);
    showToast({ message: "保存失败", icon: "fail" });
  } finally {
    tagsLoading.value = false;
  }
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="广场设置" left-arrow @click-left="goBack" />

    <div class="section-card">
      <div class="pref-row">
        <div class="pref-text">
          <span class="pref-name">允许在广场被发现</span>
          <span class="pref-desc">开启后你的交友卡片会展示在广场中</span>
        </div>
        <van-switch
          :model-value="allowDiscover"
          :loading="switchLoading"
          size="24px"
          @update:model-value="onAllowDiscoverChange"
        />
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">交友宣言</div>
      <p class="section-desc">一句话介绍自己，会展示在你的广场卡片上</p>
      <textarea
        v-model="motto"
        class="motto-input"
        placeholder="介绍一下自己吧，例如：爱旅行、爱摄影，想认识有趣的你"
        maxlength="255"
        rows="4"
      ></textarea>
      <div class="counter">{{ motto.length }}/255</div>
      <van-button
        block
        round
        type="primary"
        :loading="mottoLoading"
        @click="onSaveMotto"
      >
        保存宣言
      </van-button>
    </div>

    <div class="section-card">
      <div class="section-title">我的标签</div>
      <p class="section-desc">最多 {{ MAX_TAGS }} 个，每个不超过 {{ MAX_TAG_LEN }} 个字</p>
      <div class="tag-editor">
        <span v-if="tags.length === 0" class="tag-empty">还没有标签，添加一个吧</span>
        <span
          v-for="tag in tags"
          :key="tag"
          class="tag-chip"
          @click="removeTag(tag)"
        >
          {{ tag }}
          <span class="tag-close">×</span>
        </span>
      </div>
      <div class="tag-add">
        <input
          v-model="tagInput"
          type="text"
          class="tag-input"
          :maxlength="MAX_TAG_LEN"
          placeholder="输入标签，回车添加"
          @keyup.enter="addTag"
        />
        <button class="add-btn" @click="addTag">添加</button>
        <button class="save-btn" :disabled="tagsLoading" @click="onSaveTags">
          {{ tagsLoading ? "保存中" : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.section-card {
  margin: 16px 16px 0;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 18px 16px;
  box-shadow: var(--shadow-xs);
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pref-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pref-name {
  font-size: 15px;
  color: var(--text-primary);
}

.pref-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.motto-input {
  width: 100%;
  padding: 12px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--input-border-focus);
  }

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.counter {
  margin: 6px 2px 12px;
  text-align: right;
  font-size: 12px;
  color: var(--text-tertiary);
}

.tag-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  min-height: 32px;
}

.tag-empty {
  font-size: 13px;
  color: var(--text-placeholder);
  align-self: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(64, 150, 255, 0.1);
  border: 1px solid rgba(64, 150, 255, 0.2);
  border-radius: var(--radius-full);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;

  .tag-close {
    color: var(--text-tertiary);
    font-size: 15px;
    line-height: 1;
  }
}

.tag-add {
  display: flex;
  gap: 8px;
}

.tag-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: var(--input-border-focus);
  }

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.add-btn,
.save-btn {
  height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.add-btn {
  background: var(--surface-alt);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);

  &:active {
    background: var(--surface-active);
  }
}

.save-btn {
  background: var(--gradient-primary);
  border: none;
  color: var(--text-inverse);
  font-weight: 500;

  &:disabled {
    opacity: 0.6;
  }
}
</style>
