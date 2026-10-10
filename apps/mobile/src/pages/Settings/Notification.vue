<script setup lang="ts">
import { reactive, ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { kv_get, kv_set } from "@workspace/services";
import { useI18n } from "@/i18n";

interface NotifyItem {
  key: string;
  nameKey: string;
  default: boolean;
}

const router = useRouter();
const { t } = useI18n();

const STORAGE_KEY = "ui_notify_prefs";

interface NotifyPrefs {
  receive: boolean;
  sound: boolean;
  vibration: boolean;
  preview: boolean;
  nightDnd: boolean;
}

const loadPrefs = async (): Promise<NotifyPrefs> => {
  try {
    const raw = await kv_get(STORAGE_KEY);
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

const prefs = reactive<NotifyPrefs>(defaultPrefs());

watch(
  prefs,
  (value) => {
    kv_set(STORAGE_KEY, JSON.stringify(value)).catch(() => {});
  },
  { deep: true }
);

onMounted(async () => {
  Object.assign(prefs, await loadPrefs());
});

const toggle = (key: keyof NotifyPrefs, checked: boolean) => {
  prefs[key] = checked;
};

const messageItems = ref<NotifyItem[]>([
  {
    key: "receive",
    nameKey: "settings.notificationSettings.receiveNewMessage",
    default: true,
  },
  {
    key: "sound",
    nameKey: "settings.notificationSettings.soundReminder",
    default: true,
  },
  {
    key: "vibration",
    nameKey: "settings.notificationSettings.vibrationReminder",
    default: false,
  },
]);

const detailItems = ref<NotifyItem[]>([
  {
    key: "preview",
    nameKey: "settings.notificationSettings.showMessageDetails",
    default: true,
  },
]);

const dndItems = ref<NotifyItem[]>([
  {
    key: "nightDnd",
    nameKey: "settings.notificationSettings.nightDoNotDisturb",
    default: false,
  },
]);

const goBack = () => router.back();
</script>

<template>
  <div class="settings-page">
    <van-nav-bar
      :title="t('settings.menu.notification.name')"
      left-arrow
      @click-left="goBack"
    />

    <div class="section-card">
      <div class="section-title">
        {{ t("settings.notificationSettings.newMessage") }}
      </div>
      <div class="notify-list">
        <div v-for="item in messageItems" :key="item.key" class="notify-row">
          <span class="notify-name">{{ t(item.nameKey) }}</span>
          <van-switch
            :model-value="prefs[item.key as keyof NotifyPrefs]"
            size="22px"
            @update:model-value="toggle(item.key as keyof NotifyPrefs, $event)"
          />
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        {{ t("settings.notificationSettings.notificationDetails") }}
      </div>
      <div class="notify-list">
        <div v-for="item in detailItems" :key="item.key" class="notify-row">
          <div class="notify-text">
            <span class="notify-name">{{ t(item.nameKey) }}</span>
            <span class="notify-desc">{{
              t("settings.notificationSettings.showMessageDetailsDesc")
            }}</span>
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
      <div class="section-title">
        {{ t("settings.notificationSettings.doNotDisturb") }}
      </div>
      <div class="notify-list">
        <div v-for="item in dndItems" :key="item.key" class="notify-row">
          <div class="notify-text">
            <span class="notify-name">{{ t(item.nameKey) }}</span>
            <span class="notify-desc">{{
              t("settings.notificationSettings.nightDoNotDisturbDesc")
            }}</span>
          </div>
          <van-switch
            :model-value="prefs[item.key as keyof NotifyPrefs]"
            size="22px"
            @update:model-value="toggle(item.key as keyof NotifyPrefs, $event)"
          />
        </div>
      </div>
    </div>

    <p class="page-tip">
      {{ t("settings.notificationSettings.localTip") }}
    </p>
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
