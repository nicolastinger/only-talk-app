<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  BulbOutlined,
  EyeOutlined,
  MessageOutlined,
} from '@ant-design/icons-vue';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  getDoNotDisturbRange,
  isDoNotDisturbEnabled,
  isMessageSoundEnabled,
  playMessageSound,
  setDoNotDisturbEnabled,
  setDoNotDisturbRange,
  setMessageSoundEnabled,
  subscribeMessageSoundChange,
} from '@workspace/services';
import { useI18n } from '@/i18n';
import styles from '../Settings.module.less';

const { t } = useI18n();

/** "HH:mm" -> dayjs(今天, 指定时分)，供 TimePicker 使用 */
const toDayjs = (hhmm: string): Dayjs => {
  const [hour, minute] = hhmm.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0);
};

// 消息提示音开关(持久化在 client_config: app.message_sound)
const soundEnabled = ref(isMessageSoundEnabled());
// 免打扰开关与时段(持久化在 client_config: app.do_not_disturb*)
const dndEnabled = ref(isDoNotDisturbEnabled());
const dndRange = ref(getDoNotDisturbRange());

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  // 顶栏静音按钮改的也是同一个开关，双向同步
  unsubscribe = subscribeMessageSoundChange((enabled) => {
    soundEnabled.value = enabled;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});

const changeSoundEnabled = (enabled: boolean) => {
  soundEnabled.value = enabled;
  setMessageSoundEnabled(enabled).catch(() => {});
  // 打开时试听一次，方便确认效果
  if (enabled) playMessageSound();
};

const changeDndEnabled = (enabled: boolean) => {
  dndEnabled.value = enabled;
  setDoNotDisturbEnabled(enabled).catch(() => {});
};

const changeDndTime = (which: 'start' | 'end', value: string) => {
  const next = { ...dndRange.value, [which]: value };
  dndRange.value = next;
  setDoNotDisturbRange(next.start, next.end).catch(() => {});
};

const onTimeChange = (
  which: 'start' | 'end',
  value: Dayjs | null,
  timeString: string | string[],
) => {
  const text = Array.isArray(timeString) ? timeString[0] : timeString;
  if (text) changeDndTime(which, text);
};

type CheckboxChange = { target: { checked: boolean } };

const onSoundChange = (e: CheckboxChange) => {
  changeSoundEnabled(e.target.checked);
};

const onDndChange = (e: CheckboxChange) => {
  changeDndEnabled(e.target.checked);
};

const onStartTimeChange = (
  value: Dayjs | null,
  timeString: string | string[],
) => {
  onTimeChange('start', value, timeString);
};

const onEndTimeChange = (
  value: Dayjs | null,
  timeString: string | string[],
) => {
  onTimeChange('end', value, timeString);
};
</script>

<template>
  <div :class="styles.settingSection">
    <a-typography-title :level="3" :class="styles.sectionTitle">
      {{ t('settings.notificationSettings.title') }}
    </a-typography-title>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <MessageOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.notificationSettings.messageNotification') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-checkbox default-checked :class="styles.settingCheckbox">
        {{ t('settings.notificationSettings.receiveNewMessage') }}
      </a-checkbox>
      <a-checkbox
        :checked="soundEnabled"
        :class="styles.settingCheckbox"
        @change="onSoundChange"
      >
        {{ t('settings.notificationSettings.soundReminder') }}
      </a-checkbox>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.notificationSettings.messageNotificationDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <EyeOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.notificationSettings.notificationDetails') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-checkbox default-checked :class="styles.settingCheckbox">
        {{ t('settings.notificationSettings.showMessagePreview') }}
      </a-checkbox>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.notificationSettings.notificationDetailsDesc') }}
      </a-typography-text>
    </a-card>

    <a-card :class="styles.settingCard">
      <div :class="styles.cardHeader">
        <BulbOutlined :class="styles.cardIcon" />
        <a-typography-text strong>
          {{ t('settings.notificationSettings.doNotDisturb') }}
        </a-typography-text>
      </div>
      <a-divider :class="styles.divider" />
      <a-checkbox
        :checked="dndEnabled"
        :class="styles.settingCheckbox"
        @change="onDndChange"
      >
        {{ t('settings.notificationSettings.nightDoNotDisturb') }}
      </a-checkbox>
      <div :class="styles.dndRange">
        <a-typography-text type="secondary">
          {{ t('settings.notificationSettings.doNotDisturbRange') }}
        </a-typography-text>
        <a-time-picker
          :class="styles.dndTimePicker"
          :value="toDayjs(dndRange.start)"
          format="HH:mm"
          :minute-step="5"
          :allow-clear="false"
          size="small"
          :disabled="!dndEnabled"
          @change="onStartTimeChange"
        />
        <span :class="styles.dndRangeSep">–</span>
        <a-time-picker
          :class="styles.dndTimePicker"
          :value="toDayjs(dndRange.end)"
          format="HH:mm"
          :minute-step="5"
          :allow-clear="false"
          size="small"
          :disabled="!dndEnabled"
          @change="onEndTimeChange"
        />
      </div>
      <a-typography-text type="secondary" :class="styles.description">
        {{ t('settings.notificationSettings.nightDoNotDisturbDesc') }}
      </a-typography-text>
    </a-card>
  </div>
</template>
