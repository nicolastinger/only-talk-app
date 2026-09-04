<script setup lang="ts">
import { reactive, ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";

interface NotifyItem {
  key: string;
  name: string;
  desc?: string;
  default: boolean;
}

const router = useRouter();

const STORAGE_KEY = "onlytalk_settings_notification";

interface NotifyPrefs {
  receive: boolean;
  sound: boolean;
  vibration: boolean;
  preview: boolean;
  nightDnd: boolean;
}

const loadPrefs = (): NotifyPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultPrefs();
};

const defaultPrefs = (): NotifyPrefs => ({
  receive: true,
  sound: true,
  vibration: false,
  preview: true,
  nightDnd: false,
});

const prefs = reactive<NotifyPrefs>(loadPrefs());

watch(
  prefs,
  (value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true }
);

onMounted(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
});

const toggle = (key: keyof NotifyPrefs, checked: boolean) => {
  prefs[key] = checked;
};

const messageItems = ref<NotifyItem[]>([
  { key: "receive", name: "接收新消息通知", default: true },
  { key: "sound", name: "声音提醒", default: true },
  { key: "vibration", name: "震动提醒", default: false },
]);

const detailItems = ref<NotifyItem[]>([
  { key: "preview", name: "通知栏显示消息详情", default: true },
]);

const dndItems = ref<NotifyItem[]>([
  { key: "nightDnd", name: "夜间免打扰", default: false },
]);

const goBack = () => router.back();
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="消息通知" left-arrow @click-left="goBack" />

    <div class="section-card">
      <div class="section-title">新消息通知</div>
      <div class="notify-list">
        <div v-for="item in messageItems" :key="item.key" class="notify-row">
          <span class="notify-name">{{ item.name }}</span>
          <van-switch
            :model-value="prefs[item.key as keyof NotifyPrefs]"
            size="22px"
            @update:model-value="toggle(item.key as keyof NotifyPrefs, $event)"
          />
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">通知详情</div>
      <div class="notify-list">
        <div v-for="item in detailItems" :key="item.key" class="notify-row">
          <div class="notify-text">
            <span class="notify-name">{{ item.name }}</span>
            <span class="notify-desc">关闭后通知将不展示消息内容，保护隐私</span>
          </div>
          <van-switch
            :model-value="prefs[item.key as keyof NotifyPrefs]"
            size="22px"
            @update:model-value="toggle(item.key as keyof NotifyPrefs, $event)"
          />
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">免打扰</div>
      <div class="notify-list">
        <div v-for="item in dndItems" :key="item.key" class="notify-row">
          <div class="notify-text">
            <span class="notify-name">{{ item.name }}</span>
            <span class="notify-desc">夜间（23:00 - 次日 08:00）不推送提醒</span>
          </div>
          <van-switch
            :model-value="prefs[item.key as keyof NotifyPrefs]"
            size="22px"
            @update:model-value="toggle(item.key as keyof NotifyPrefs, $event)"
          />
        </div>
      </div>
    </div>

    <p class="page-tip">提醒设置仅保存在本机，重新安装后需重新设置。</p>
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
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.section-title {
  padding: 14px 16px 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.notify-list {
  padding: 4px 0;
}

.notify-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.notify-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.notify-name {
  font-size: 15px;
  color: var(--text-primary);
}

.notify-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.page-tip {
  margin: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
